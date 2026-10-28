const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const extensionRoot = join(__dirname, '..')
const background = require('../src/background.js')

test('uses the documented deterministic loopback port range', () => {
  assert.deepEqual(background.portCandidates(), [53791, 53808, 53825, 53842, 53859, 53876, 53893, 53910, 53927, 53944])
})

test('filters privileged and dashboard tabs without discarding file tabs', () => {
  const tabs = [
    { id: 1, url: 'https://example.com', title: 'Example' },
    { id: 2, url: 'https://app.mytab.space/', title: 'Tab Space' },
    { id: 3, url: 'chrome://settings', title: 'Settings' },
    { id: 4, url: 'about:preferences', title: 'Preferences' },
    { id: 5, url: 'file:///tmp/notes.html', title: 'Notes' },
    { id: 6, url: 'https://example.com', title: 'Duplicate' },
    { id: 7, url: 'https://pinned.example', title: 'Pinned', pinned: true }
  ]

  assert.deepEqual(
    background.normalizeTabs(tabs, { ignorePinned: true, ignoreDuplicates: true }).map(tab => tab.id),
    [1, 5]
  )
})

test('lists only non-trash sessions as popup append destinations', () => {
  assert.deepEqual(background.popupSessionOptions([
    {
      uuid: 'keep',
      title: 'Reading',
      timestamp: 123,
      sites: [{ url: 'https://example.com' }],
      tags: [{ name: 'Personal' }]
    },
    {
      uuid: 'trash',
      title: 'Old',
      sites: [],
      tags: [{ name: '@Trash' }]
    },
    { title: 'Missing UUID', sites: [], tags: [] }
  ]), [{
    uuid: 'keep',
    title: 'Reading',
    timestamp: 123,
    siteCount: 1
  }])
})

test('advertises dashboard AI only when both the helper and this extension support it', () => {
  assert.deepEqual(background.dashboardCapabilities(['sessions.read']), ['sessions.read'])
  assert.deepEqual(
    background.dashboardCapabilities(['sessions.read', 'ai.v1']),
    ['sessions.read', 'ai.v1', 'dashboard.ai.v1']
  )
})

test('lists all browser windows for the switcher and activates the selected tab', async () => {
  const calls = []
  const browserApi = {
    queryTabs: async query => {
      calls.push(['query', query])
      return [
        { id: 4, windowId: 1, title: 'One', url: 'https://one.example', active: true },
        { id: 8, windowId: 2, title: 'Two', url: 'https://two.example' },
        { id: 9, windowId: 2, title: 'Settings', url: 'chrome://settings' },
        { id: 10, windowId: 2, title: 'Tab Space', url: 'https://app.mytab.space/' },
        { id: 11, windowId: 2, title: 'No access', url: '' },
        { windowId: 2, title: 'No id', url: 'https://three.example' }
      ]
    },
    updateTab: async (id, properties) => calls.push(['update', id, properties]),
    updateWindow: async (id, properties) => calls.push(['window', id, properties])
  }
  const controller = background.createController({ browserApi, client: {} })

  // Saving skips the dashboard and browser pages; switching to them is fine.
  assert.deepEqual((await controller.listSwitcherTabs()).map(tab => tab.id), [4, 8, 9, 10])
  await controller.activateSwitcherTab(8, 2)
  assert.deepEqual(calls.slice(-2), [
    ['window', 2, { state: 'normal', focused: true }],
    ['update', 8, { active: true }]
  ])
})

test('reports when each switcher tab last came to the front', async () => {
  const stored = {}
  let clock = 1000
  const activations = background.createActivationTracker({
    storage: {
      get: async key => ({ [key]: stored[key] }),
      set: async values => Object.assign(stored, values)
    },
    now: () => clock
  })
  await activations.record(8)
  clock = 5000
  await activations.record(4)

  const controller = background.createController({
    browserApi: {
      queryTabs: async () => [
        // The browser's own value wins when it is newer than the record ...
        { id: 4, windowId: 1, title: 'One', url: 'https://one.example', lastAccessed: 9000.4 },
        // ... and the record wins when the browser missed a window switch.
        { id: 8, windowId: 2, title: 'Two', url: 'https://two.example', lastAccessed: 500 },
        // Safari reports nothing, so an unrecorded tab carries no time at all.
        { id: 9, windowId: 2, title: 'Three', url: 'https://three.example' }
      ]
    },
    client: {},
    activations
  })

  const tabs = await controller.listSwitcherTabs()
  assert.deepEqual(tabs.map(tab => tab.lastAccessed), [9000, 1000, undefined])
  assert.equal('lastAccessed' in tabs[2], false)

  // A suspended background starts over from session storage.
  const revived = background.createActivationTracker({
    storage: { get: async key => ({ [key]: stored[key] }), set: async () => {} }
  })
  assert.deepEqual(await revived.snapshot(), { 4: 5000, 8: 1000 })
})

test('keeps only the most recent tab activations', async () => {
  let clock = 0
  const activations = background.createActivationTracker({ now: () => ++clock })
  for (let id = 1; id <= 2001; id += 1) activations.record(id)
  const times = await activations.snapshot()
  assert.equal(Object.keys(times).length, 2000)
  assert.equal(times[1], undefined)
  assert.equal(times[2001], 2001)
})

test('publishes a complete 501-tab Safari snapshot without truncation', async () => {
  const tabs = Array.from({ length: 501 }, (_, index) => ({
    id: index + 1,
    windowId: Math.floor(index / 100) + 1,
    title: `Tab ${index + 1}`,
    url: `https://example.com/${index + 1}`
  }))
  let queries = 0
  const controller = background.createController({
    browserApi: {
      queryTabs: async query => {
        assert.deepEqual(query, {})
        queries += 1
        return tabs
      }
    },
    client: {}
  })

  const result = await controller.listSwitcherTabs()
  assert.equal(queries, 1)
  assert.equal(result.length, 501)
  assert.equal(result.at(-1).id, 501)
})

test('answers helper switcher events through the authenticated bridge', async () => {
  const requests = []
  const controller = {
    listSwitcherTabs: async () => [{ id: 7, windowId: 3, title: 'Docs', url: 'https://docs.example' }],
    activateSwitcherTab: async (tabID, windowID) => {
      assert.equal(tabID, 7)
      assert.equal(windowID, 3)
    }
  }
  const client = {
    request: async (method, params) => requests.push([method, params])
  }

  await background.handleSwitcherEvent(
    { event: 'switcher.tabs.request', requestID: 'tabs-request' },
    controller,
    client
  )
  await background.handleSwitcherEvent(
    { event: 'switcher.tab.activate', requestID: 'activate-request', tabID: 7, windowID: 3 },
    controller,
    client
  )
  assert.deepEqual(requests, [
    ['switcher.tabs.publish', {
      requestID: 'tabs-request',
      tabs: [{ id: 7, windowId: 3, title: 'Docs', url: 'https://docs.example' }]
    }],
    ['switcher.tab.activated', { requestID: 'activate-request', activated: true }]
  ])
})

test('closes switcher tabs one at a time when the batch is rejected, and counts what really closed', async () => {
  let living = [4, 8, 12]
  const browserApi = {
    queryTabs: async () => living.map(id => ({ id, windowId: 1, title: 'T', url: 'https://a.example' })),
    removeTabs: async ids => {
      // Mirrors the engines that reject the whole call when one id is stale.
      if (Array.isArray(ids)) throw new Error('Safari requires a scalar tab id')
      if (!living.includes(ids)) throw new Error('No tab with id: ' + ids)
      living = living.filter(id => id !== ids)
    }
  }
  const controller = background.createController({ browserApi, client: {} })

  // 99 was already gone; 12 is left open and must not be counted as closed.
  assert.deepEqual(await controller.closeSwitcherTabs([4, 8, 99]), { closed: 3 })
  assert.deepEqual(living, [12])

  assert.deepEqual(await controller.closeSwitcherTabs([]), { closed: 0 })
  assert.deepEqual(await controller.closeSwitcherTabs(['nope', null]), { closed: 0 })
})

test('waits for Safari close results to become visible before acknowledging them', async () => {
  let living = [7]
  let queryCount = 0
  const delays = []
  const browserApi = {
    queryTabs: async () => {
      queryCount += 1
      if (queryCount === 3) living = []
      return living.map(id => ({ id, windowId: 1, title: 'T', url: 'https://a.example' }))
    },
    removeTabs: async () => {}
  }
  const controller = background.createController({
    browserApi,
    client: {},
    delay: async milliseconds => delays.push(milliseconds)
  })

  assert.deepEqual(await controller.closeSwitcherTabs([7, 7]), { closed: 1 })
  assert.deepEqual(delays, [25, 50])
})

test('answers a switcher close event even when closing fails outright', async () => {
  const requests = []
  const client = { request: async (method, params) => requests.push([method, params]) }

  await background.handleSwitcherEvent(
    { event: 'switcher.tabs.close', requestID: 'close-ok', tabIDs: [1, 2] },
    { closeSwitcherTabs: async () => ({ closed: 2 }) },
    client
  )
  await background.handleSwitcherEvent(
    { event: 'switcher.tabs.close', requestID: 'close-bad', tabIDs: [1] },
    { closeSwitcherTabs: async () => { throw new Error('boom') } },
    client
  )

  assert.deepEqual(requests, [
    ['switcher.tabs.closed', { requestID: 'close-ok', closed: 2 }],
    ['switcher.tabs.closed', {
      requestID: 'close-bad',
      closed: 0,
      error: { code: 'unexpected_error', message: 'boom' }
    }]
  ])
})

test('advertises the close capability alongside tab listing', () => {
  assert.equal(background.SWITCHER_CAPABILITY, 'switcher.tabs.v1')
  assert.equal(background.SWITCHER_CLOSE_CAPABILITY, 'switcher.tabs.close.v1')
})

test('maps every dashboard data command onto protocol v2 methods', () => {
  const allLegacyCommands = [
    'VerifyOnboardingWebsiteAccess', 'DuplicateTab', 'RedirectToSpace', 'GoToSpace',
    'SaveTabs', 'SaveCurrentTab', 'SetDefault', 'CheckDefault',
    'CheckSwitcherHelperStatus', 'CheckSyncStatus', 'OpenTabSpaceApp',
    'OpenInExternalBrowser1', 'OpenInExternalBrowser2', 'CloseRightTabs',
    'CloseLeftTabs', 'CloseSameDomainTabs', 'CloseOtherTabs', 'AddToNotes',
    'AppendSessions', 'MergeSessions', 'DeleteSession', 'UpdateSession', 'UpSession',
    'SwapSession', 'MoveSession', 'RestoreSession', 'CheckBookmarks',
    'ReportDashboardTiming', 'ListBackups', 'RestoreBackup', 'ForceBackup',
    'CheckDevBridge', 'PrepareAI', 'EnhanceSession', 'ClusterTabs', 'SaveSplitSessions',
    'GetSuggestions', 'DismissSuggestion', 'CheckSubscriptionStatus',
    'PurchaseSubscription', 'RestorePurchases'
  ]
  assert.equal(allLegacyCommands.length, 41)
  for (const cmd of allLegacyCommands) {
    assert.doesNotThrow(() => background.dashboardCommandToOperation({
      cmd, bookmarks: '[]', clusters: '[]', uuids: []
    }), cmd)
  }
  assert.equal(background.dashboardCommandToOperation({ cmd: 'CheckBookmarks' }).method, 'sessions.list')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'AppendSessions', bookmarks: '[]' }).method, 'sessions.append')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'UpdateSession', bookmarks: [] }).method, 'sessions.update')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'DeleteSession', bookmarks: [] }).method, 'sessions.delete')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'MergeSessions', bookmarks: [] }).method, 'sessions.merge')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'UpSession', bookmarks: [] }).method, 'sessions.up')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'SwapSession', uuids: [] }).method, 'sessions.swap')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'MoveSession', uuids: [] }).method, 'sessions.move')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'CheckDefault', name: 'x' }).method, 'settings.get')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'SetDefault', name: 'x', value: 'y' }).method, 'settings.set')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'ListBackups' }).method, 'backups.list')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'ForceBackup' }).method, 'backups.create')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'RestoreBackup', filename: 'a' }).method, 'backups.restore')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'PrepareAI' }).method, 'ai.prepare')
  assert.deepEqual(
    background.dashboardCommandToOperation({
      cmd: 'EnhanceSession',
      uuid: 'session-1',
      bookmarks: [{ uuid: 'session-1', sites: [{ title: 'Example', url: 'https://example.com' }] }]
    }),
    {
      kind: 'native',
      method: 'ai.enhance',
      params: {
        uuid: 'session-1',
        sites: [{ title: 'Example', url: 'https://example.com' }]
      }
    }
  )
  assert.equal(background.dashboardCommandToOperation({ cmd: 'ClusterTabs', bookmarks: [{}] }).method, 'ai.cluster')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'SaveSplitSessions', clusters: '[]' }).method, 'sessions.saveSplit')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'GetSuggestions' }).method, 'suggestions.list')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'DismissSuggestion', id: 's-1' }).method, 'suggestions.dismiss')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'CheckSubscriptionStatus' }).method, 'subscription.status')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'PurchaseSubscription' }).method, 'subscription.purchase')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'RestorePurchases' }).method, 'subscription.restore')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'ReportDashboardTiming' }).method, 'diagnostics.dashboardTiming')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'VerifyOnboardingWebsiteAccess' }).method, 'onboarding.websiteAccessVerified')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'OpenTabSpaceApp' }).method, 'app.open')
  assert.deepEqual(
    background.dashboardCommandToOperation({ cmd: 'CheckDefault', name: 'tabspace-native-protocol-version' }).result,
    { name: 'tabspace-native-protocol-version', value: '3' }
  )
  assert.throws(() => background.dashboardCommandToOperation({ cmd: 'ClaimFreeTrial' }), /Unsupported dashboard command/)
  assert.deepEqual(background.dashboardMessageForEvent({ event: 'sessions.changed', revision: 9 }), {
    cmd: 'SessionsChangedRemotely',
    revision: 9
  })
})

test('maps protocol v2 AI and subscription results back to dashboard messages', () => {
  const bookmarkMessage = background.dashboardMessagesFor(
    { kind: 'native', method: 'sessions.list' },
    { sessions: [{ uuid: 'one' }] }
  )[0]
  assert.equal(bookmarkMessage.cmd, 'ReturnBookmarks')
  assert.deepEqual(bookmarkMessage.bookmarks, [{ uuid: 'one' }])
  assert.equal(bookmarkMessage.value, '[{"uuid":"one"}]')
  assert.equal(typeof bookmarkMessage.dispatchedAtMs, 'number')
  assert.deepEqual(
    background.dashboardMessagesFor(
      { kind: 'native', method: 'ai.enhance' },
      {
        uuid: 'session-1',
        title: 'Research',
        tags: [{ name: 'Work' }],
        quotaRemaining: 4,
        quotaResetAt: 123
      }
    ),
    [{
      cmd: 'ReturnEnhancedSession',
      uuid: 'session-1',
      title: 'Research',
      tags: '[{"name":"Work"}]',
      quotaRemaining: 4,
      quotaResetAt: 123
    }]
  )
  assert.deepEqual(
    background.dashboardMessagesFor(
      { kind: 'native', method: 'ai.cluster' },
      { originalUuid: 'session-1', clusters: [{ name: 'One', tags: [], sites: [] }] }
    ),
    [{
      cmd: 'ReturnSplitPreview',
      originalUuid: 'session-1',
      clusters: '[{"name":"One","tags":[],"sites":[]}]'
    }]
  )
  assert.deepEqual(
    background.dashboardMessagesFor(
      { kind: 'native', method: 'suggestions.list' },
      { suggestions: [{ id: 'suggestion-1' }] }
    ),
    [{ cmd: 'ReturnSuggestions', suggestions: '[{"id":"suggestion-1"}]' }]
  )
  assert.deepEqual(
    background.dashboardMessagesFor(
      { kind: 'native', method: 'subscription.status' },
      { status: 'active', tier: 'pro', quotaRemaining: -1 }
    ),
    [{ cmd: 'ReturnSubscriptionStatus', status: 'active', tier: 'pro', quotaRemaining: -1 }]
  )
  assert.deepEqual(
    background.dashboardMessagesFor(
      { kind: 'native', method: 'subscription.purchase' },
      { redirected: true }
    ),
    [{ cmd: 'PurchaseResult', redirected: true }]
  )
})

test('acknowledges a split save after the bookmarks, and turns a refusal into the same message', async () => {
  const operation = background.dashboardCommandToOperation({
    cmd: 'SaveSplitSessions',
    clusters: '[{"name":"Topic A","tags":[],"sites":[{"title":"A","url":"https://a.example"}]}]',
    originalUuid: 'session-research'
  })
  const sessions = [{ uuid: 'split-1', title: 'Topic A', sites: [], tags: [] }]
  const messages = background.dashboardMessagesFor(operation, { sessions })
  assert.deepEqual(messages.map(message => message.cmd), ['ReturnBookmarks', 'ReturnSplitSaved'])
  assert.deepEqual(messages[1], { cmd: 'ReturnSplitSaved', originalUuid: 'session-research', ok: true })

  // The native side refuses the split (Free limit, nothing left to save, a
  // failed write). The preview dialog is waiting on ReturnSplitSaved, and the
  // Safari direct bridge has no request-error channel, so the refusal must
  // travel as that message rather than as a rejected request.
  const refuse = code => background.createController({
    browserApi: {},
    client: {
      request: async () => {
        throw new background.BridgeError(code, 'refused', code === 'session_limit_reached' ? { limit: 2 } : undefined)
      }
    }
  })
  const limited = await refuse('session_limit_reached').handleDashboard({
    cmd: 'SaveSplitSessions', clusters: '[]', originalUuid: 'session-research'
  })
  assert.deepEqual(limited, {
    messages: [{
      cmd: 'ReturnSplitSaved', originalUuid: 'session-research', ok: false, error: 'session_limit_reached', limit: 2
    }],
    result: null
  })
  const nothing = await refuse('nothing_to_save').handleDashboard({
    cmd: 'SaveSplitSessions', clusters: '[]', originalUuid: 'session-research'
  })
  assert.deepEqual(nothing.messages, [{
    cmd: 'ReturnSplitSaved', originalUuid: 'session-research', ok: false, error: 'nothing_to_save'
  }])

  // Safari's native fallback rethrows a plain Error carrying only the code.
  const plain = background.createController({
    browserApi: {},
    client: { request: async () => { const error = new Error('refused'); error.code = 'save_failed'; throw error } }
  })
  const failed = await plain.handleDashboard({ cmd: 'SaveSplitSessions', clusters: '[]', originalUuid: 'session-research' })
  assert.deepEqual(failed.messages, [{
    cmd: 'ReturnSplitSaved', originalUuid: 'session-research', ok: false, error: 'save_failed'
  }])

  // Every other command still surfaces its failure as a rejected request.
  await assert.rejects(
    refuse('session_limit_reached').handleDashboard({ cmd: 'AppendSessions', bookmarks: [] }),
    error => error.code === 'session_limit_reached'
  )
})

test('handles direct protocol replies locally and dispatches legacy browser commands', async () => {
  const browserCommands = []
  const controller = background.createController({
    browserApi: {},
    client: { request: async () => { throw new Error('native request was not expected') } },
    browserCommand: async (command, data) => browserCommands.push([command, data])
  })

  const protocol = await controller.handleDashboard({
    cmd: 'CheckDefault', name: 'tabspace-native-protocol-version'
  })
  assert.deepEqual(protocol.messages, [{
    cmd: 'ReturnDefault', id: 'tabspace-native-protocol-version', value: '3'
  }])

  await controller.handleDashboard({ cmd: 'DuplicateTab', source: 'dashboard' })
  assert.deepEqual(browserCommands, [[
    'DuplicateTab', { cmd: 'DuplicateTab', source: 'dashboard' }
  ]])
})

test('pushes session invalidations to every dashboard tab and nowhere else', async () => {
  const sent = []
  const queries = []
  const result = await background.sendDashboardEvent({
    queryTabs: async query => queries.push(query) && [
      { id: 1, url: 'https://app.mytab.space/' },
      { id: 2, url: 'https://app.mytab.space/settings' },
      { id: 3, url: 'https://example.com/' }
    ],
    sendTabMessage: async (id, message) => sent.push([id, message])
  }, { event: 'sessions.changed', revision: 12 })

  // Only dashboard tabs are asked for: Safari counts reading any other tab's
  // URL as a request for access to that site.
  assert.deepEqual(queries, [{ url: ['https://app.mytab.space/*'] }])
  assert.equal(result.sent, 2)
  assert.deepEqual(sent, [
    [1, { type: 'dashboard.nativeMessage', message: { cmd: 'SessionsChangedRemotely', revision: 12 } }],
    [2, { type: 'dashboard.nativeMessage', message: { cmd: 'SessionsChangedRemotely', revision: 12 } }]
  ])
})

test('a save asks open dashboards to refresh before it returns, once per revision', async () => {
  const sent = []
  const browserApi = {
    queryTabs: async query => query.currentWindow
      ? [{ id: 42, windowId: 1, title: 'Example', url: 'https://example.com' }]
      : [
          { id: 42, windowId: 1, title: 'Example', url: 'https://example.com' },
          { id: 7, windowId: 1, url: 'https://app.mytab.space/' }
        ],
    sendTabMessage: async (id, message) => sent.push([id, message.message.cmd, message.message.revision]),
    removeTabs: async () => {},
    dashboardUrl: () => 'https://app.mytab.space/'
  }
  const client = {
    request: async (method, params) => {
      if (method === 'settings.get') return { name: params.name, value: 'false' }
      return { sessions: [], revision: 12 }
    },
    pair: async () => {},
    connect: async () => {}
  }
  const notifyDashboards = background.createDashboardChangeNotifier(browserApi)
  const controller = background.createController({ browserApi, client, notifyDashboards })

  await controller.saveTabIds([42])
  assert.deepEqual(sent, [[7, 'SessionsChangedRemotely', 12]])

  // The helper's broadcast of the same change arrives afterwards: no second refresh.
  assert.deepEqual(await notifyDashboards(12), { sent: 0, duplicate: true })
  assert.deepEqual(sent, [[7, 'SessionsChangedRemotely', 12]])

  // A change the extension did not make, and a native-fallback save with no
  // revision, both still reach the dashboard.
  await notifyDashboards(13)
  await notifyDashboards(undefined)
  assert.deepEqual(sent.map(entry => entry[2]), [12, 13, undefined])
})

test('saving never closes tabs before the native acknowledgement', async () => {
  const calls = []
  let acknowledge
  const nativeAcknowledgement = new Promise(resolve => { acknowledge = resolve })
  const browserApi = {
    queryTabs: async () => [{ id: 42, windowId: 1, title: 'Example', url: 'https://example.com' }],
    createTab: async () => {},
    updateTab: async () => {},
    removeTabs: async ids => calls.push(['remove', ids]),
    dashboardUrl: () => 'https://app.mytab.space/'
  }
  const client = {
    request: async (method, params) => {
      calls.push(['request', method, params])
      if (method === 'settings.get') return { name: params.name, value: 'false' }
      return nativeAcknowledgement
    },
    pair: async () => {},
    connect: async () => {}
  }
  const controller = background.createController({ browserApi, client })
  const save = controller.saveTabIds([42])

  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls[0][0], 'request')
  assert.equal(calls.some(call => call[0] === 'remove'), false)

  acknowledge({ sessions: [] })
  const result = await save
  assert.deepEqual(result.tabIds, [42])
  assert.equal(calls.some(call => call[0] === 'remove'), false)

  await controller.closeTabs(result.tabIds)
  assert.deepEqual(calls.at(-1), ['remove', [42]])
})

test('runs remembered post-save actions only after the native acknowledgement', async () => {
  const calls = []
  let acknowledge
  const nativeAcknowledgement = new Promise(resolve => { acknowledge = resolve })
  const browserApi = {
    queryTabs: async query => query.url
      ? []
      : [{ id: 42, windowId: 1, title: 'Example', url: 'https://example.com' }],
    createTab: async properties => calls.push(['create', properties]),
    updateTab: async () => {},
    removeTabs: async ids => calls.push(['remove', ids]),
    dashboardUrl: () => 'https://app.mytab.space/'
  }
  const client = {
    request: async (method, params) => {
      calls.push(['request', method, params])
      if (method === 'settings.get') return { name: params.name, value: 'false' }
      return nativeAcknowledgement
    },
    pair: async () => {},
    connect: async () => {}
  }
  const controller = background.createController({ browserApi, client })
  const save = controller.saveTabIds([42], {
    closeTabsAfterSave: true,
    openDashboardAfterSave: true
  })

  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls.some(call => ['remove', 'create'].includes(call[0])), false)

  acknowledge({ sessions: [] })
  const result = await save
  assert.deepEqual(calls.slice(-2), [
    ['remove', [42]],
    ['create', { url: 'https://app.mytab.space/', active: true }]
  ])
  assert.equal(result.closedTabs, true)
  assert.equal(result.openedDashboard, true)
  assert.deepEqual(result.postSaveErrors, [])
})

function saveCloseApi({ dashboards = [], createdWindowId = 1 } = {}) {
  const calls = []
  const pages = [
    { id: 41, windowId: 1, title: 'One', url: 'https://one.example' },
    { id: 42, windowId: 1, title: 'Two', url: 'https://two.example', active: true },
    { id: 43, windowId: 1, title: 'Three', url: 'https://three.example' }
  ]
  return {
    calls,
    queryTabs: async query => {
      if (query.active) return pages.filter(tab => tab.active)
      if (query.currentWindow) return pages
      return [...pages, ...dashboards]
    },
    createTab: async properties => {
      calls.push(['create', properties])
      return { id: 99, windowId: createdWindowId, url: properties.url }
    },
    updateTab: async (id, properties) => calls.push(['update', id, properties]),
    updateWindow: async (id, properties) => calls.push(['window', id, properties]),
    removeTabs: async ids => calls.push(['remove', ids]),
    dashboardUrl: () => 'https://app.mytab.space/'
  }
}

const saveCloseClient = {
  request: async method => method === 'settings.get' ? { value: 'false' } : { sessions: [] },
  pair: async () => {},
  connect: async () => {}
}

test('Safari Save & Close opens the dashboard first and then closes every saved tab, the active one too', async () => {
  const browserApi = saveCloseApi()
  const controller = background.createController({ browserApi, client: saveCloseClient })
  const result = await controller.saveTabIds([41, 42, 43], {
    closeTabsAfterSave: true,
    openDashboardAfterSave: true,
    preserveActiveTab: true
  })
  assert.deepEqual(browserApi.calls, [
    ['create', { url: 'https://app.mytab.space/', active: true }],
    ['remove', [41, 42, 43]]
  ])
  assert.equal(result.closedTabs, true)
  assert.equal(result.openedDashboard, true)
})

test('Safari Save & Close keeps the active tab when the dashboard lives in another window', async () => {
  const browserApi = saveCloseApi({
    dashboards: [{ id: 7, windowId: 2, url: 'https://app.mytab.space/' }]
  })
  const controller = background.createController({ browserApi, client: saveCloseClient })
  await controller.saveTabIds([41, 42, 43], {
    closeTabsAfterSave: true,
    openDashboardAfterSave: true,
    preserveActiveTab: true
  })
  // The saving window would otherwise close with its last tab.
  assert.deepEqual(browserApi.calls.at(-1), ['remove', [41, 43]])
})

test('Safari Save & Close keeps the active tab when the dashboard could not be opened', async () => {
  const browserApi = saveCloseApi()
  browserApi.createTab = async () => { throw Object.assign(new Error('blocked'), { code: 'blocked' }) }
  const controller = background.createController({ browserApi, client: saveCloseClient })
  const result = await controller.saveTabIds([41, 42, 43], {
    closeTabsAfterSave: true,
    openDashboardAfterSave: true,
    preserveActiveTab: true
  })
  assert.deepEqual(browserApi.calls.at(-1), ['remove', [41, 43]])
  assert.equal(result.openedDashboard, false)
  assert.equal(result.postSaveErrors[0].action, 'openDashboard')
})

test('appends selected tabs to an existing session through the atomic native method', async () => {
  const calls = []
  const browserApi = {
    queryTabs: async () => [{ id: 9, windowId: 1, title: 'Docs', url: 'https://docs.example' }],
    createTab: async () => {},
    updateTab: async () => {},
    removeTabs: async () => {},
    dashboardUrl: () => 'https://app.mytab.space/'
  }
  const client = {
    request: async (method, params) => {
      calls.push([method, params])
      if (method === 'settings.get') return { name: params.name, value: 'false' }
      return { sessions: [] }
    },
    pair: async () => {},
    connect: async () => {}
  }
  const controller = background.createController({ browserApi, client })
  const result = await controller.saveTabIds([9], { destinationSessionUuid: 'session-123' })
  const appendTo = calls.find(call => call[0] === 'sessions.appendTo')
  assert.deepEqual(appendTo, ['sessions.appendTo', {
    uuid: 'session-123',
    sites: [{ title: 'Docs', url: 'https://docs.example' }]
  }])
  assert.equal(calls.some(call => call[0] === 'sessions.append'), false)
  assert.equal(result.appendedToExisting, true)
})

test('opens an existing dashboard tab without relying on port-sensitive match patterns', async () => {
  const calls = []
  const browserApi = {
    queryTabs: async query => {
      calls.push(['query', query])
      return [{ id: 7, url: 'https://app.mytab.space/sessions' }]
    },
    updateTab: async (id, properties) => calls.push(['update', id, properties]),
    createTab: async properties => calls.push(['create', properties]),
    dashboardUrl: () => 'https://app.mytab.space/'
  }
  const controller = background.createController({ browserApi, client: {} })
  const result = await controller.openDashboard()
  assert.deepEqual(calls, [
    ['query', {}],
    ['query', { active: true, currentWindow: true }],
    ['update', 7, { active: true }]
  ])
  assert.deepEqual(result, { reused: true })
})

test('reuses the dashboard in the current window first, and brings another window forward otherwise', async () => {
  function makeApi(tabs) {
    const calls = []
    return {
      calls,
      queryTabs: async query => query.active ? tabs.filter(tab => tab.active && tab.windowId === 1) : tabs,
      updateTab: async (id, properties) => calls.push(['update', id, properties]),
      updateWindow: async (id, properties) => calls.push(['window', id, properties]),
      createTab: async properties => calls.push(['create', properties]),
      dashboardUrl: () => 'https://app.mytab.space/'
    }
  }
  const both = makeApi([
    { id: 1, windowId: 2, url: 'https://app.mytab.space/' },
    { id: 2, windowId: 1, url: 'https://example.com', active: true },
    { id: 3, windowId: 1, url: 'https://app.mytab.space/settings' }
  ])
  assert.deepEqual(await background.createController({ browserApi: both, client: {} }).openDashboard(), { reused: true, windowId: 1 })
  assert.deepEqual(both.calls, [['update', 3, { active: true }]])

  const elsewhere = makeApi([
    { id: 1, windowId: 2, url: 'https://app.mytab.space/' },
    { id: 2, windowId: 1, url: 'https://example.com', active: true }
  ])
  assert.deepEqual(await background.createController({ browserApi: elsewhere, client: {} }).openDashboard(), { reused: true, windowId: 2 })
  assert.deepEqual(elsewhere.calls, [
    ['update', 1, { active: true }],
    ['window', 2, { state: 'normal', focused: true }]
  ])
})

test('the dashboard is told which upgrade prompt a save earned', () => {
  const append = background.dashboardCommandToOperation({ cmd: 'AppendSessions', bookmarks: '[]' })
  const messages = background.dashboardMessagesFor(append, {
    sessions: [],
    milestone: { message: 'SessionUpgradeSuggested', limit: 2 }
  })
  assert.deepEqual(messages.map(message => message.cmd), ['ReturnBookmarks', 'SessionUpgradeSuggested'])
  assert.equal(messages[1].limit, 2)

  // A toolbar save has no page: its prompt rides back on the library the
  // dashboard asks for when that save opens it.
  const check = background.dashboardCommandToOperation({ cmd: 'CheckBookmarks' })
  assert.equal(check.params.origin, 'dashboard')
  const delivered = background.dashboardMessagesFor(check, {
    sessions: [],
    milestone: { message: 'SessionQuotaExhausted', limit: 2 }
  })
  assert.deepEqual(delivered.map(message => message.cmd), ['ReturnBookmarks', 'SessionQuotaExhausted'])

  // No milestone, no extra message.
  assert.deepEqual(
    background.dashboardMessagesFor(check, { sessions: [] }).map(message => message.cmd),
    ['ReturnBookmarks']
  )
})

test('dashboard-initiated saves carry their origin for the app\'s analytics', () => {
  const append = background.dashboardCommandToOperation({ cmd: 'AppendSessions', bookmarks: '[]' })
  assert.equal(append.params.origin, 'dashboard')
  const split = background.dashboardCommandToOperation({ cmd: 'SaveSplitSessions', clusters: '[]', originalUuid: 'x' })
  assert.equal(split.params.origin, 'dashboard')
})

test('default full selection honors all-window and pinned-tab preferences', async () => {
  const calls = []
  const browserApi = {
    queryTabs: async query => query.currentWindow
      ? [
          { id: 1, windowId: 10, title: 'Current', url: 'https://one.example' },
          { id: 2, windowId: 10, title: 'Pinned', url: 'https://pinned.example', pinned: true }
        ]
      : [
          { id: 1, windowId: 10, title: 'Current', url: 'https://one.example' },
          { id: 2, windowId: 10, title: 'Pinned', url: 'https://pinned.example', pinned: true },
          { id: 3, windowId: 20, title: 'Other', url: 'https://two.example' }
        ],
    createTab: async () => {},
    updateTab: async () => {},
    removeTabs: async () => {},
    dashboardUrl: () => 'https://app.mytab.space/'
  }
  const client = {
    request: async (method, params) => {
      calls.push([method, params])
      if (method === 'settings.get') return { name: params.name, value: 'true' }
      return { sessions: [] }
    },
    pair: async () => {},
    connect: async () => ({ protocolVersion: 2, capabilities: [] })
  }
  const controller = background.createController({ browserApi, client })
  const result = await controller.saveTabIds([1, 2], { allWindowsIfEnabled: true })

  assert.deepEqual(result.tabIds, [1, 3])
  const append = calls.find(call => call[0] === 'sessions.append')
  assert.equal(append[1].sessions.length, 2)
  assert.deepEqual(append[1].sessions.map(session => session.sites.map(site => site.url)), [
    ['https://one.example'],
    ['https://two.example']
  ])
})

test('popup checks the helper connection before listing savable tabs', () => {
  const popup = readFileSync(join(extensionRoot, 'src/popup.js'), 'utf8')
  const connect = popup.indexOf('send({ type: "popup.connect" })')
  const listTabs = popup.indexOf('send({ type: "popup.listTabs" })')
  assert.notEqual(connect, -1)
  assert.notEqual(listTabs, -1)
  assert.equal(connect < listTabs, true)
})

test('Safari popup explains missing website access and reports fallback use', () => {
  const popup = readFileSync(join(extensionRoot, 'src/popup.js'), 'utf8')
  const background = readFileSync(join(extensionRoot, 'src/background.js'), 'utf8')
  assert.equal(background.includes('activeTabs[0].url === ""'), true)
  assert.equal(background.includes('"website_access_required"'), true)
  assert.equal(background.includes('case "safari.menuTelemetry"'), true)
  assert.equal(popup.includes('strings.websiteAccessRequired'), true)
  assert.equal(popup.includes('send({ type: "safari.menuTelemetry" })'), true)
})

test('popup exposes and persists both opt-in post-save actions', () => {
  const html = readFileSync(join(extensionRoot, 'src/popup.html'), 'utf8')
  const popup = readFileSync(join(extensionRoot, 'src/popup.js'), 'utf8')
  assert.equal(html.includes('id="open-dashboard-after-save" type="checkbox"'), true)
  assert.equal(html.includes('id="close-tabs-after-save" type="checkbox"'), true)
  assert.equal(popup.includes('tabspace-open-dashboard-after-save'), true)
  assert.equal(popup.includes('tabspace-close-tabs-after-save'), true)
  assert.equal(popup.includes('openDashboardAfterSave: elements.openDashboardAfterSave.checked'), true)
  assert.equal(popup.includes('closeTabsAfterSave: elements.closeTabsAfterSave.checked'), true)
  assert.equal(popup.includes('openDashboardAfterSave: "打开 Tab Space 管理页"'), true)
  assert.equal(popup.includes('打开 Tab Space Dashboard'), false)
})

test('popup keeps tab selection collapsed and uses one destination menu', () => {
  const html = readFileSync(join(extensionRoot, 'src/popup.html'), 'utf8')
  const popup = readFileSync(join(extensionRoot, 'src/popup.js'), 'utf8')
  assert.equal(html.includes('id="customize-tabs"'), true)
  assert.equal(html.includes('class="utility-actions"'), true)
  assert.equal(html.includes('id="tab-section" hidden'), true)
  assert.equal(html.includes('<option value="new"'), true)
  assert.equal(html.includes('id="existing-session"'), false)
  assert.equal(popup.includes('capabilities.includes("sessions.appendTo")'), true)
  assert.equal(popup.includes('option.value = `session:${session.uuid}`'), true)
  assert.equal(popup.includes('destinationSessionUuid: destinationSessionUuid()'), true)
})

test('ships one toolbar icon per size and no theme-specific variant', () => {
  // The icon deliberately does not follow the browser theme; see the comment on
  // default_icon in build.mjs. A light variant reappearing here would mean the
  // runtime switching came back with it.
  for (const size of [16, 32, 48, 128]) {
    assert.equal(existsSync(join(extensionRoot, `assets/toolbar-${size}.png`)), true)
    assert.equal(existsSync(join(extensionRoot, `assets/toolbar-light-${size}.png`)), false)
  }
  assert.equal(existsSync(join(extensionRoot, 'assets/toolbar.svg')), true)
})

test('builds valid browser-specific Manifest V3 packages', () => {
  execFileSync(process.execPath, [join(extensionRoot, 'build.mjs'), 'all'], { stdio: 'pipe' })
  for (const target of ['chrome', 'edge', 'firefox']) {
    // Only the Safari package has a page-side listener for the direct bridge;
    // here it would send the dashboard's library to nobody.
    const contentScript = readFileSync(join(extensionRoot, `dist/${target}/content-script.js`), 'utf8')
    assert.equal(contentScript.includes('const SAFARI_DIRECT_BRIDGE = false'), true, target)
    // The app icon, one export per size rather than one 1024 px image.
    const manifest = JSON.parse(readFileSync(join(extensionRoot, `dist/${target}/manifest.json`), 'utf8'))
    assert.deepEqual(manifest.icons, {
      16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png'
    }, target)
    for (const file of Object.values(manifest.icons)) {
      assert.equal(existsSync(join(extensionRoot, `dist/${target}/${file}`)), true, `${target}/${file}`)
    }
    assert.equal(existsSync(join(extensionRoot, `dist/${target}/icon.png`)), false, target)
  }
  const chrome = JSON.parse(readFileSync(join(extensionRoot, 'dist/chrome/manifest.json'), 'utf8'))
  const edge = JSON.parse(readFileSync(join(extensionRoot, 'dist/edge/manifest.json'), 'utf8'))
  const firefox = JSON.parse(readFileSync(join(extensionRoot, 'dist/firefox/manifest.json'), 'utf8'))

  assert.equal(chrome.manifest_version, 3)
  assert.equal(chrome.background.service_worker, 'background.js')
  assert.equal(chrome.action.default_icon['16'], 'toolbar-16.png')
  assert.equal(chrome.permissions.includes('offscreen'), false)
  assert.equal(edge.permissions.includes('offscreen'), false)
  assert.deepEqual(edge.background, chrome.background)
  assert.deepEqual(firefox.background, { scripts: ['background.js'] })
  assert.equal(firefox.browser_specific_settings.gecko.id, 'extension@mytab.space')
  assert.deepEqual(
    firefox.browser_specific_settings.gecko.data_collection_permissions,
    { required: ['none'] }
  )
  assert.equal(firefox.permissions.includes('offscreen'), false)

  // The fixed icon is for Chromium only. Firefox resolves the theme itself and
  // keeps the dark/light pair theme_icons switches between.
  assert.equal('theme_icons' in chrome.action, false)
  assert.equal('theme_icons' in edge.action, false)
  assert.deepEqual(firefox.action.theme_icons, [
    { size: 16, dark: 'toolbar-16.png', light: 'toolbar-light-16.png' },
    { size: 32, dark: 'toolbar-32.png', light: 'toolbar-light-32.png' }
  ])

  for (const manifest of [chrome, edge, firefox]) {
    assert.deepEqual(manifest.content_scripts[0].matches, ['https://app.mytab.space/*'])
    assert.equal(manifest.permissions.includes('tabs'), true)
    assert.equal(manifest.permissions.includes('storage'), true)
    // Without this the alarms API is undefined and the bridge cannot recover
    // from a suspended background context.
    assert.equal(manifest.permissions.includes('alarms'), true)
    // Only Safari drops this (Safari 17 blocks the bridge under any
    // connect-src; see build.mjs). Everywhere else extension pages may
    // connect to the loopback bridge and nothing else.
    assert.match(manifest.content_security_policy.extension_pages, /connect-src ws:\/\/127\.0\.0\.1:\*/)
    // Every package names its icons the same way; the artwork behind those
    // names is what differs between Chromium and Firefox.
    assert.deepEqual(manifest.action.default_icon, chrome.action.default_icon)
  }
  for (const target of ['chrome', 'edge', 'firefox']) {
    assert.equal(existsSync(join(extensionRoot, `dist/packages/tab-space-${target}.zip`)), true)
    const prefix = target === 'firefox' ? 'toolbar-firefox' : 'toolbar'
    for (const size of [16, 32, 48, 128]) {
      assert.deepEqual(
        readFileSync(join(extensionRoot, `dist/${target}/toolbar-${size}.png`)),
        readFileSync(join(extensionRoot, `assets/${prefix}-${size}.png`))
      )
      // Only Firefox carries the second, theme-switched set.
      assert.equal(
        existsSync(join(extensionRoot, `dist/${target}/toolbar-light-${size}.png`)),
        target === 'firefox'
      )
    }
    for (const filename of ['offscreen.html', 'offscreen-theme.js']) {
      assert.equal(existsSync(join(extensionRoot, `dist/${target}/${filename}`)), false)
    }
  }
})

test('builds development packages for loopback and Pages previews only', () => {
  execFileSync(process.execPath, [join(extensionRoot, 'build.mjs'), 'all'], { stdio: 'pipe' })
  execFileSync(process.execPath, [join(extensionRoot, 'build.mjs'), 'dev'], { stdio: 'pipe' })
  const developmentManifest = JSON.parse(readFileSync(join(extensionRoot, 'dist/chrome-dev/manifest.json'), 'utf8'))
  const developmentBackground = readFileSync(join(extensionRoot, 'dist/chrome-dev/background.js'), 'utf8')
  const developmentContentScript = readFileSync(join(extensionRoot, 'dist/firefox-dev/content-script.js'), 'utf8')
  const firefoxDevelopmentManifest = JSON.parse(readFileSync(join(extensionRoot, 'dist/firefox-dev/manifest.json'), 'utf8'))
  const previewPattern = 'https://*.tab-space-admin.pages.dev/*'
  const branchPattern = 'https://dev-4-0.tab-space-admin.pages.dev/*'
  assert.deepEqual(developmentManifest.content_scripts[0].matches, [branchPattern, 'http://127.0.0.1:8080/*', previewPattern])
  assert.deepEqual(firefoxDevelopmentManifest.content_scripts[0].matches, [branchPattern, 'http://127.0.0.1/*', previewPattern])
  assert.deepEqual(firefoxDevelopmentManifest.host_permissions, [branchPattern, 'http://127.0.0.1/*', previewPattern])
  assert.equal(
    developmentBackground.includes('const DASHBOARD_ORIGINS = ["https://dev-4-0.tab-space-admin.pages.dev","http://127.0.0.1:8080"]'),
    true
  )
  assert.equal(developmentBackground.includes('https://app.mytab.space'), false)
  assert.equal(developmentContentScript.includes('if (!isDashboardOrigin(window.location.origin)) return'), true)
  assert.equal(developmentContentScript.includes('http://127.0.0.1:8080'), true)
  assert.equal(developmentContentScript.includes('"tab-space-admin.pages.dev"'), true)

  const developmentModule = require(join(extensionRoot, 'dist/chrome-dev/background.js'))
  assert.equal(developmentModule.isDashboardOrigin('http://127.0.0.1:8080'), true)
  assert.equal(developmentModule.isDashboardOrigin('https://dev-4-0.tab-space-admin.pages.dev'), true)
  assert.equal(developmentModule.isDashboardOrigin('https://tab-space-admin.pages.dev'), true)
  assert.equal(developmentModule.isDashboardOrigin('https://eviltab-space-admin.pages.dev'), false)
  assert.equal(developmentModule.isDashboardOrigin('http://dev-4-0.tab-space-admin.pages.dev'), false)
  assert.equal(developmentModule.isDashboardOrigin('http://127.0.0.1:8081'), false)

  const productionManifest = JSON.parse(readFileSync(join(extensionRoot, 'dist/chrome/manifest.json'), 'utf8'))
  assert.deepEqual(productionManifest.content_scripts[0].matches, ['https://app.mytab.space/*'])
  assert.equal(productionManifest.content_scripts[0].matches.some(match => match.includes('pages.dev')), false)

  execFileSync(process.execPath, [join(extensionRoot, 'build.mjs'), 'all'], { stdio: 'pipe' })
  assert.equal(existsSync(join(extensionRoot, 'dist/chrome-dev/manifest.json')), true)
})

test('opens the requested development dashboard first without dropping the others', () => {
  execFileSync(
    process.execPath,
    [join(extensionRoot, 'build.mjs'), 'dev', 'chrome', '--dashboard=http://127.0.0.1:8080/#/'],
    { stdio: 'pipe' }
  )
  const manifest = JSON.parse(readFileSync(join(extensionRoot, 'dist/chrome-dev/manifest.json'), 'utf8'))
  const script = readFileSync(join(extensionRoot, 'dist/chrome-dev/background.js'), 'utf8')
  assert.deepEqual(manifest.content_scripts[0].matches, [
    'http://127.0.0.1:8080/*',
    'https://*.tab-space-admin.pages.dev/*'
  ])
  assert.equal(script.includes('const DASHBOARD_ORIGINS = ["http://127.0.0.1:8080"]'), true)
  assert.throws(() => execFileSync(
    process.execPath,
    [join(extensionRoot, 'build.mjs'), 'chrome', '--dashboard=https://dev-4-0.tab-space-admin.pages.dev'],
    { stdio: 'pipe' }
  ))
  execFileSync(process.execPath, [join(extensionRoot, 'build.mjs'), 'dev', 'chrome'], { stdio: 'pipe' })
})

test('trusts only dashboard origins the extension is built for', () => {
  assert.equal(background.isDashboardOrigin('https://app.mytab.space'), true)
  assert.equal(background.isDashboardOrigin('https://app.mytab.space.evil.example'), false)
  assert.equal(background.isDashboardOrigin('http://127.0.0.1:8080'), false)
  assert.equal(background.isDashboardUrl('https://app.mytab.space/#/sessions'), true)
  assert.equal(background.isDashboardUrl('not a url'), false)
  assert.equal(background.isDashboardUrl(undefined), false)
})

test('treats a Pro-only refusal as terminal instead of re-pairing', () => {
  // A collection refusal must keep library access available. Older hosts
  // may also refuse the handshake; retrying or re-pairing cannot upgrade them.
  const backgroundSource = readFileSync(join(extensionRoot, 'src/background.js'), 'utf8')
  const popup = readFileSync(join(extensionRoot, 'src/popup.js'), 'utf8')

  // A Pro refusal outranks every other handshake answer, so it is the one the
  // popup is given even when another account's helper on the same Mac answered
  // "this browser is unknown" first.
  assert.equal(background.preferredBridgeError(
    new Error('x'),
    Object.assign(new Error('pro'), { code: 'pro_required' })
  ).code, 'pro_required')
  assert.equal(background.preferredBridgeError(
    Object.assign(new Error('pro'), { code: 'pro_required' }),
    Object.assign(new Error('unknown browser'), { code: 'pairing_required' })
  ).code, 'pro_required')

  const proBranch = popup.indexOf('response.error.code === "pro_required"')
  const pairingBranch = popup.indexOf('["pairing_required", "authentication_failed"].includes(response.error.code)')
  assert.notEqual(proBranch, -1)
  assert.notEqual(pairingBranch, -1)
  assert.equal(proBranch < pairingBranch, true, 'the Pro check must precede the pairing fallback')
  assert.equal(popup.includes('strings.proRequired'), true)
  assert.equal(popup.includes('proRequired: "Library access is included. Saving tabs from this browser requires Pro.'), true)
  assert.equal(popup.includes('proRequired: "资料库可免费访问。从此浏览器保存标签页需要 Pro。'), true)
})

class FakeReconnectWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    FakeReconnectWebSocket.instances.push(this)
  }

  send(data) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
  }

  open() {
    this.readyState = 1
    if (this.onopen) this.onopen()
  }

  receive(data) {
    if (this.onmessage) this.onmessage({ data })
  }
}

function answerHello(socket, token) {
  for (const raw of socket.sent) {
    const message = JSON.parse(raw)
    if (message.method !== 'hello') continue
    socket.receive(JSON.stringify({
      version: 2,
      id: message.id,
      result: { authenticated: true, protocolVersion: 2, capabilities: [], token }
    }))
    return true
  }
  return false
}

const settle = () => new Promise(resolve => setImmediate(resolve))

// Refuse the rest of one sweep, one port at a time. An unused loopback port
// refuses the connection immediately, and that refusal is what lets the sweep
// move on to the next port. The count is explicit so this stops at the end of
// the sweep instead of swallowing the socket that follows it.
async function refuseRemainingPorts(fromIndex, count) {
  let index = fromIndex
  for (let remaining = count; remaining > 0; remaining -= 1) {
    const socket = FakeReconnectWebSocket.instances[index]
    if (!socket) break
    if (socket.onerror) socket.onerror()
    index += 1
    await settle()
  }
  return index
}

const sweepLength = background.portCandidates().length

function rejectHello(socket, code) {
  for (const raw of socket.sent) {
    const message = JSON.parse(raw)
    if (message.method !== 'hello') continue
    socket.receive(JSON.stringify({
      version: 2,
      id: message.id,
      error: { code, message: code }
    }))
    return true
  }
  return false
}

test('a WebSocket the browser refuses to construct is a transport failure, not an app error', async () => {
  class RefusedWebSocket {
    constructor() {
      throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError', code: 18 })
    }
  }
  const client = new background.LocalBridgeClient({
    WebSocket: RefusedWebSocket,
    storage: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    client: { browser: 'safari' },
    reconnectDelays: [60000]
  })
  // Every port refuses the same way; the caller must see the code its
  // transport fallback keys on, never the raw DOMException.
  await assert.rejects(client.request('settings.get', { name: 'x' }), { code: 'helper_unavailable' })
  client.cancelReconnect()
})

test('automatically pairs Safari after the helper requests pairing', async () => {
  FakeReconnectWebSocket.instances = []
  const removed = []
  const stored = []
  const client = new background.LocalBridgeClient({
    WebSocket: FakeReconnectWebSocket,
    storage: {
      get: async () => ({ 'tabspace-client-id': 'safari-client' }),
      set: async values => stored.push(values),
      remove: async keys => removed.push(keys)
    },
    client: { browser: 'safari' },
    pairingCodeProvider: async () => '123456'
  })

  const connection = client.connect()
  await settle()
  const firstSocket = FakeReconnectWebSocket.instances[0]
  firstSocket.open()
  await settle()
  assert.ok(rejectHello(firstSocket, 'pairing_required'))
  await settle()
  // The sweep now visits every remaining port before the pairing code is
  // fetched, so that another account's helper answering first cannot hide this
  // browser's own.
  const retryIndex = await refuseRemainingPorts(1, sweepLength - 1)

  const secondSocket = FakeReconnectWebSocket.instances[retryIndex]
  secondSocket.open()
  await settle()
  const hello = secondSocket.sent.map(JSON.parse).find(message => message.method === 'hello')
  assert.equal(hello.params.browser, 'safari')
  assert.equal(hello.params.pairingCode, '123456')
  assert.ok(answerHello(secondSocket, 'safari-token'))
  assert.equal((await connection).authenticated, true)
  // The stored token is never discarded on the way to pairing: a pairing
  // attempt that fails must leave a credential that still worked in place.
  assert.deepEqual(removed, [])
  assert.deepEqual(stored.at(-1), {
    'tabspace-bridge-port': 53791,
    'tabspace-auth-token': 'safari-token'
  })
})

// A client whose storage behaves like a real browser profile: what the client
// writes is what the next read returns.
function storedClient(options = {}) {
  const values = { 'tabspace-client-id': 'browser-1', ...(options.values || {}) }
  const writes = []
  const awaiting = []
  const client = new background.LocalBridgeClient({
    // Announced at once unless a test is about the delay itself.
    approvalAnnounceDelay: 0,
    ...(options.clientOptions || {}),
    WebSocket: FakeReconnectWebSocket,
    storage: {
      get: async keys => Object.fromEntries(keys
        .filter(key => values[key] !== undefined)
        .map(key => [key, values[key]])),
      set: async update => { writes.push(update); Object.assign(values, update) },
      remove: async keys => { for (const key of keys) delete values[key] }
    },
    client: { browser: options.browser || 'chrome' },
    onAwaitingApproval: details => awaiting.push(details || {})
  })
  return { client, values, writes, awaiting }
}

function sentMethods(socket) {
  return socket.sent.map(JSON.parse).map(message => message.method)
}

function answerMethod(socket, method, result) {
  for (const raw of socket.sent) {
    const message = JSON.parse(raw)
    if (message.method !== method) continue
    socket.receive(JSON.stringify({ version: 2, id: message.id, result }))
    return JSON.parse(raw)
  }
  return null
}

function rejectMethod(socket, method, code) {
  for (const raw of socket.sent) {
    const message = JSON.parse(raw)
    if (message.method !== method) continue
    socket.receive(JSON.stringify({ version: 2, id: message.id, error: { code, message: code } }))
    return JSON.parse(raw)
  }
  return null
}

// Opens the next socket the sweep creates and hands it to `respond`.
async function atPort(index, respond) {
  const socket = FakeReconnectWebSocket.instances[index]
  assert.ok(socket, `no socket was opened for port index ${index}`)
  socket.open()
  await settle()
  respond(socket)
  await settle()
  return socket
}

test('keeps looking past another account\'s helper on the same Mac', async () => {
  // Every logged-in account runs its own helper and loopback ports are
  // machine-wide, so the helper that answers first is often one that has never
  // seen this browser. Giving up there is what left a paired browser unable to
  // reach its own helper.
  FakeReconnectWebSocket.instances = []
  const { client, values } = storedClient({ values: { 'tabspace-auth-token': 'token-1' } })

  const connection = client.connect()
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const mine = await atPort(1, socket => assert.ok(answerHello(socket, 'token-1')))

  assert.equal((await connection).authenticated, true)
  assert.equal(client.socket, mine)
  // The port that answered is remembered, so the next connect starts there.
  assert.equal(values['tabspace-bridge-port'], 53808)
})

test('tries the port that answered last time before sweeping', async () => {
  FakeReconnectWebSocket.instances = []
  const { client } = storedClient({
    values: { 'tabspace-auth-token': 'token-1', 'tabspace-bridge-port': 53825 }
  })

  const connection = client.connect()
  await settle()
  assert.match(FakeReconnectWebSocket.instances[0].url, /:53825\//)
  await atPort(0, socket => assert.ok(answerHello(socket, 'token-1')))
  assert.equal((await connection).authenticated, true)
})

test('asks the Mac app to approve this browser instead of a pairing code', async () => {
  FakeReconnectWebSocket.instances = []
  const { client, values, writes, awaiting } = storedClient()

  const connection = client.connect({ trigger: 'user', requestApproval: true })
  await settle()
  const helper = await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  // The handshake says which connects may be approved at all.
  assert.equal(JSON.parse(helper.sent[0]).params.trigger, 'user')
  const next = await refuseRemainingPorts(1, sweepLength - 1)

  // Only after the whole sweep found no helper that knows this browser is the
  // person asked: a helper further down the sweep might have authenticated it.
  const prompt = await atPort(next, socket => {
    assert.deepEqual(sentMethods(socket), ['pairing.request'])
    assert.ok(answerMethod(socket, 'pairing.request', {
      authenticated: true,
      protocolVersion: 2,
      capabilities: [],
      token: 'approved-token'
    }))
  })

  assert.equal((await connection).authenticated, true)
  assert.equal(client.socket, prompt)
  assert.equal(values['tabspace-auth-token'], 'approved-token')
  assert.deepEqual(writes.at(-1), {
    'tabspace-bridge-port': 53791,
    'tabspace-auth-token': 'approved-token'
  })
  // The waiting state is announced once, not once per helper.
  assert.equal(awaiting.length, 1)
})

test('moves on to the next helper when one declines the request', async () => {
  // The prompt lands in the Mac session of whoever owns that helper, so on a
  // shared Mac the first answer can be "no" from somebody else's account.
  FakeReconnectWebSocket.instances = []
  const { client, values } = storedClient()

  const connection = client.connect({ trigger: 'user', requestApproval: true })
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  await atPort(1, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const next = await refuseRemainingPorts(2, sweepLength - 2)

  await atPort(next, socket => assert.ok(rejectMethod(socket, 'pairing.request', 'pairing_declined')))
  await atPort(next + 1, socket => assert.ok(answerMethod(socket, 'pairing.request', {
    authenticated: true,
    protocolVersion: 2,
    capabilities: [],
    token: 'second-token'
  })))

  assert.equal((await connection).authenticated, true)
  assert.equal(values['tabspace-auth-token'], 'second-token')
  assert.equal(values['tabspace-bridge-port'], 53808)
})

test('never asks for approval on a background wake-up', async () => {
  // An unattended reconnect would be approved by whoever is at the machine,
  // which on a shared Mac is not necessarily this browser's owner.
  FakeReconnectWebSocket.instances = []
  const { client, awaiting } = storedClient()

  const connection = client.connect({ trigger: 'background' })
  const refusal = connection.then(() => null, error => error)
  await settle()
  const helper = await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  assert.equal(JSON.parse(helper.sent[0]).params.trigger, 'background')
  await refuseRemainingPorts(1, sweepLength - 1)

  assert.equal((await refusal).code, 'pairing_required')
  assert.deepEqual(awaiting, [])
  for (const socket of FakeReconnectWebSocket.instances) {
    assert.equal(sentMethods(socket).includes('pairing.request'), false)
  }
})

test('does not offer approval to a helper that refused on entitlement', async () => {
  // Nobody approving a prompt can turn a Pro refusal into access, and asking
  // would present an upgrade as if it were a connection problem.
  FakeReconnectWebSocket.instances = []
  const { client, awaiting } = storedClient({ values: { 'tabspace-auth-token': 'token-1' } })

  const connection = client.connect({ trigger: 'user', requestApproval: true })
  const refusal = connection.then(() => null, error => error)
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pro_required')))
  await refuseRemainingPorts(1, sweepLength - 1)

  assert.equal((await refusal).code, 'pro_required')
  assert.deepEqual(awaiting, [])
  for (const socket of FakeReconnectWebSocket.instances) {
    assert.equal(sentMethods(socket).includes('pairing.request'), false)
  }
})

test('stays silent until this browser has a credential', async () => {
  const unpaired = storedClient()
  assert.equal(await unpaired.client.hasCredential(), false)
  const paired = storedClient({ values: { 'tabspace-auth-token': 'token-1' } })
  assert.equal(await paired.client.hasCredential(), true)

  // install() gates every background wake-up on that answer, so an unpaired
  // browser stops knocking on every helper on the machine once a minute.
  const source = readFileSync(join(extensionRoot, 'src/background.js'), 'utf8')
  const wake = source.slice(source.indexOf('function wakeBridge()'))
  assert.match(wake.slice(0, wake.indexOf('}')), /hasCredential\(\)/)
})

test('an unpaired browser does not reconnect when the helper closes its socket', async () => {
  // The helper closing an approval socket — the app quit, say — used to start
  // a retry loop that swept every port on the machine every fifteen seconds.
  FakeReconnectWebSocket.instances = []
  const { client } = storedClient({ clientOptions: { reconnectDelays: [5, 5] } })

  const connection = client.connect({ trigger: 'user', requestApproval: true })
  const outcome = connection.then(() => null, error => error)
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const next = await refuseRemainingPorts(1, sweepLength - 1)
  const prompt = await atPort(next, () => {})
  prompt.onclose()
  await outcome

  const opened = FakeReconnectWebSocket.instances.length
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(FakeReconnectWebSocket.instances.length, opened)
})

test('a second caller waits on the pending approval instead of getting an empty handshake', async () => {
  // While the app is asking, the socket is open but unauthenticated. Treating
  // it as a connection handed a second popup `{}` and a broken session.
  FakeReconnectWebSocket.instances = []
  const { client } = storedClient()

  const first = client.connect({ trigger: 'user', requestApproval: true })
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const next = await refuseRemainingPorts(1, sweepLength - 1)
  const prompt = await atPort(next, () => {})
  assert.deepEqual(sentMethods(prompt), ['pairing.request'])

  let secondSettled = false
  const second = client.connect({ trigger: 'user', requestApproval: true })
    .then(result => { secondSettled = true; return result })
  const plain = client.connect()
  await settle()
  assert.equal(secondSettled, false)

  assert.ok(answerMethod(prompt, 'pairing.request', {
    authenticated: true, protocolVersion: 2, capabilities: ['x'], token: 'approved'
  }))
  for (const result of await Promise.all([first, second, plain])) {
    assert.equal(result.authenticated, true)
  }
})

test('a typed code replaces the pending approval and is not swallowed by it', async () => {
  FakeReconnectWebSocket.instances = []
  const { client, values } = storedClient()

  const approval = client.connect({ trigger: 'user', requestApproval: true })
  const approvalOutcome = approval.then(() => null, error => error)
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const next = await refuseRemainingPorts(1, sweepLength - 1)
  await atPort(next, () => {})

  const paired = client.pair('482915')
  await settle()
  // The prompt is abandoned rather than raised on the next helper.
  assert.equal((await approvalOutcome).code, 'pairing_superseded')
  await settle()

  const codeSocket = await atPort(next + 1, socket => {
    const hello = JSON.parse(socket.sent[0])
    assert.equal(hello.method, 'hello')
    assert.equal(hello.params.pairingCode, '482915')
    assert.ok(answerHello(socket, 'code-token'))
  })
  assert.equal((await paired).paired, true)
  assert.equal(client.socket, codeSocket)
  assert.equal(values['tabspace-auth-token'], 'code-token')
  for (const socket of FakeReconnectWebSocket.instances.slice(next + 1)) {
    assert.equal(sentMethods(socket).includes('pairing.request'), false)
  }
})

test('pairs Safari with a token the app issued, without touching the pairing code', async () => {
  // The one-time code may be on its way into another browser at that moment;
  // a token from the app's own native handler needs no code at all.
  FakeReconnectWebSocket.instances = []
  const { client, values } = storedClient({
    browser: 'safari',
    clientOptions: { pairingCodeProvider: async () => ({ token: 'issued-token' }) }
  })

  const connection = client.connect()
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const next = await refuseRemainingPorts(1, sweepLength - 1)
  await atPort(next, socket => {
    const hello = JSON.parse(socket.sent[0])
    assert.equal(hello.method, 'hello')
    assert.equal(hello.params.token, 'issued-token')
    assert.equal(hello.params.pairingCode, '')
    assert.ok(answerHello(socket))
  })
  assert.equal((await connection).authenticated, true)
  assert.equal(values['tabspace-auth-token'], 'issued-token')
})

test('Safari never raises an approval prompt', async () => {
  // Its extension is paired by the app over native messaging, so asking a
  // person would only add a prompt to a path that needs none.
  FakeReconnectWebSocket.instances = []
  const { client } = storedClient({
    browser: 'safari',
    clientOptions: { pairingCodeProvider: async () => '123456' }
  })

  const connection = client.connect({ trigger: 'user', requestApproval: true })
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const next = await refuseRemainingPorts(1, sweepLength - 1)
  await atPort(next, socket => {
    assert.deepEqual(sentMethods(socket), ['hello'])
    assert.ok(answerHello(socket, 'safari-token'))
  })
  assert.equal((await connection).authenticated, true)
  for (const socket of FakeReconnectWebSocket.instances) {
    assert.equal(sentMethods(socket).includes('pairing.request'), false)
  }
})

test('an app that refuses at once never shows the waiting state', async () => {
  // An app that predates approval answers the request immediately. Announcing
  // the wait up front flashed "waiting for your Mac" on every older install.
  FakeReconnectWebSocket.instances = []
  const { client, awaiting } = storedClient({ clientOptions: { approvalAnnounceDelay: 40 } })

  const connection = client.connect({ trigger: 'user', requestApproval: true })
  const outcome = connection.then(() => null, error => error)
  await settle()
  await atPort(0, socket => assert.ok(rejectHello(socket, 'pairing_required')))
  const next = await refuseRemainingPorts(1, sweepLength - 1)
  await atPort(next, socket => assert.ok(rejectMethod(socket, 'pairing.request', 'pairing_required')))

  assert.equal((await outcome).code, 'pairing_required')
  await new Promise(resolve => setTimeout(resolve, 60))
  assert.deepEqual(awaiting, [])
})

test('loading the dashboard connects without asking anyone to approve', () => {
  // A restored session reopens dashboard tabs with nobody at the keyboard, and
  // a refused browser would be asked again on every reload.
  const source = readFileSync(join(extensionRoot, 'src/background.js'), 'utf8')
  const dashboard = source.slice(source.indexOf('case "dashboard.connect":'))
  const line = dashboard.slice(0, dashboard.indexOf('\n'))
  assert.equal(line.includes('requestApproval'), false)
  const popup = source.slice(source.indexOf('case "popup.connect":'))
  assert.match(popup.slice(0, popup.indexOf('\n')), /requestApproval: true/)
})

test('gives an approval request a budget longer than the app\'s own prompt', () => {
  const { client } = storedClient()
  // Same reasoning as the AI budget: the app's typed answer — approved,
  // declined, or not visible — has to win the race against this timer.
  assert.equal(client.timeoutFor('pairing.request'), 120000)
  assert.ok(client.timeoutFor('pairing.request') > client.timeoutFor('sessions.list'))
})

test('reconnects automatically when the helper drops the socket', async () => {
  FakeReconnectWebSocket.instances = []
  // Storage keeps what the handshake issued: only a browser that holds a
  // credential reconnects on its own.
  const { client } = storedClient({ clientOptions: { reconnectDelays: [10, 10] } })

  const firstConnection = client.connect()
  await new Promise(resolve => setImmediate(resolve))
  const firstSocket = FakeReconnectWebSocket.instances[0]
  firstSocket.open()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(answerHello(firstSocket, 'token-1'))
  assert.equal((await firstConnection).authenticated, true)

  // Simulate the helper restarting (rebuild/reinstall): the browser side of
  // the socket closes without any user interaction.
  firstSocket.onclose()
  await new Promise(resolve => setTimeout(resolve, 15))
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(FakeReconnectWebSocket.instances.length, 2)
  const secondSocket = FakeReconnectWebSocket.instances[1]
  secondSocket.open()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(answerHello(secondSocket, 'token-2'))
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(client.socket, secondSocket)
  assert.equal(client.reconnectAttempts, 0)
})

test('gives the AI methods a bridge budget longer than the app\'s own', () => {
  const client = new background.LocalBridgeClient({
    WebSocket: FakeReconnectWebSocket,
    storage: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    client: { browser: 'chrome' }
  })

  assert.equal(client.timeoutFor('sessions.list'), 10000)
  assert.equal(client.timeoutFor('ai.cluster'), 90000)
  // Deliberately longer than the 60 s the app allows its own AI call: whatever
  // that call ends up reporting — a result, or a typed refusal — must reach the
  // dashboard rather than being replaced here by a generic timeout.
  assert.ok(client.timeoutFor('ai.cluster') > 60000)
})

test('does not abandon a slow AI request at the local timeout', async () => {
  const client = new background.LocalBridgeClient({
    WebSocket: FakeReconnectWebSocket,
    storage: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    client: { browser: 'chrome' },
    requestTimeout: 5,
    aiRequestTimeout: 300
  })
  client.socket = { readyState: 1, sent: [], send(raw) { this.sent.push(raw) } }

  // A local call still gives up quickly.
  await assert.rejects(
    client.requestOnOpenSocket('sessions.list', {}),
    error => error.code === 'request_timeout'
  )

  // The AI call is still waiting well past that budget, so the answer the
  // worker is about to send is still wanted when it arrives.
  const pending = client.requestOnOpenSocket('ai.cluster', {})
  await new Promise(resolve => setTimeout(resolve, 40))
  const sent = JSON.parse(client.socket.sent[1])
  client.handleMessage(JSON.stringify({
    version: 2,
    id: sent.id,
    result: { clusters: '[]', totalTabs: 449 }
  }))
  assert.deepEqual(await pending, { clusters: '[]', totalTabs: 449 })
})

test('keeps the wake-up alarm armed across a successful connection', () => {
  const alarmCalls = []
  const client = new background.LocalBridgeClient({
    WebSocket: FakeReconnectWebSocket,
    alarmApi: {
      create: (name, options) => alarmCalls.push(['create', name, options]),
      clear: name => alarmCalls.push(['clear', name])
    },
    storage: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    client: { browser: 'edge' }
  })

  client.ensureReconnectAlarm()
  client.ensureReconnectAlarm()
  assert.deepEqual(alarmCalls, [['create', 'tabspace-bridge-reconnect', { periodInMinutes: 1 }]])

  // A connection that succeeds must not clear the alarm. The background context
  // is normally suspended while connected, so clearing it here would leave a
  // browser with no way back onto the switcher.
  client.resetReconnect()
  assert.deepEqual(alarmCalls, [['create', 'tabspace-bridge-reconnect', { periodInMinutes: 1 }]])
})

class FakeFailingWebSocket {
  constructor(url) {
    this.url = url
    this.readyState = 0
    setTimeout(() => { if (this.onerror) this.onerror() }, 0)
  }

  send() {}
  close() { this.readyState = 3 }
}

function fakeEvent(name, registered) {
  return { addListener: () => registered.push(name) }
}

test('registers the wake-ups a suspended background context can be revived by', async () => {
  const registered = []
  const savedBrowser = globalThis.browser
  const savedChrome = globalThis.chrome
  const savedWebSocket = globalThis.WebSocket
  const alarmCalls = []
  const storageWrites = []

  globalThis.WebSocket = FakeFailingWebSocket
  globalThis.chrome = undefined
  globalThis.browser = {
    runtime: {
      getManifest: () => ({ version: '1.2.1' }),
      getURL: path => `moz-extension://test/${path}`,
      onMessage: fakeEvent('runtime.onMessage', registered),
      onConnect: fakeEvent('runtime.onConnect', registered),
      onStartup: fakeEvent('runtime.onStartup', registered),
      onInstalled: fakeEvent('runtime.onInstalled', registered)
    },
    alarms: {
      create: (name, options) => alarmCalls.push([name, options]),
      clear: () => {},
      onAlarm: fakeEvent('alarms.onAlarm', registered)
    },
    windows: {
      onCreated: fakeEvent('windows.onCreated', registered),
      onFocusChanged: fakeEvent('windows.onFocusChanged', registered),
      update: async () => {}
    },
    tabs: { query: async () => [], update: async () => {}, create: async () => {}, remove: async () => {} },
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      session: { set: async values => storageWrites.push(values) },
      onChanged: fakeEvent('storage.onChanged', registered)
    },
    commands: { onCommand: fakeEvent('commands.onCommand', registered) }
  }

  try {
    background.install()
    // Let the connection attempt fail across every candidate port so no timer
    // outlives the test.
    await new Promise(resolve => setTimeout(resolve, 50))

    for (const name of [
      'runtime.onStartup',
      'runtime.onInstalled',
      'windows.onCreated',
      'windows.onFocusChanged',
      'alarms.onAlarm',
      'storage.onChanged'
    ]) {
      assert.equal(registered.includes(name), true, `${name} must be registered at the top level`)
    }
    assert.deepEqual(alarmCalls, [['tabspace-bridge-reconnect', { periodInMinutes: 1 }]])
  } finally {
    globalThis.browser = savedBrowser
    globalThis.chrome = savedChrome
    globalThis.WebSocket = savedWebSocket
  }
})

test('a non-Pro save refusal never closes tabs and leaves dashboard access working', async () => {
  const removed = []
  const opened = []
  const browserApi = {
    queryTabs: async () => [{ id: 42, windowId: 1, title: 'Example', url: 'https://example.com' }],
    createTab: async options => opened.push(options),
    updateTab: async () => {},
    removeTabs: async ids => removed.push(ids),
    dashboardUrl: () => 'https://app.mytab.space/'
  }
  const client = {
    request: async (method, params) => {
      if (method === 'settings.get') return { name: params.name, value: 'false' }
      throw Object.assign(new Error('Pro required'), { code: 'pro_required' })
    }
  }
  const controller = background.createController({ browserApi, client })
  await assert.rejects(controller.saveTabIds([42], { closeTabsAfterSave: true }), { code: 'pro_required' })
  assert.deepEqual(removed, [])
  await controller.openDashboard()
  assert.equal(opened.length, 1)
})

test('popup openPaywall requests native subscription purchase and is wired in popup UI', () => {
  const html = readFileSync(join(extensionRoot, 'src/popup.html'), 'utf8')
  const popup = readFileSync(join(extensionRoot, 'src/popup.js'), 'utf8')
  const backgroundSource = readFileSync(join(extensionRoot, 'src/background.js'), 'utf8')

  assert.equal(html.includes('id="upgrade-pro"'), true)
  assert.equal(html.includes('data-i18n="upgradePro"'), true)
  assert.equal(popup.includes('upgradePro: document.getElementById("upgrade-pro")'), true)
  assert.equal(popup.includes('send({ type: "popup.openPaywall" })'), true)
  assert.equal(popup.includes('upgradePro: "升级到 Pro"'), true)
  assert.equal(popup.includes('upgradePro: "Upgrade to Pro"'), true)
  assert.equal(backgroundSource.includes('case "popup.openPaywall": return client.request("subscription.purchase"'), true)
})

test('Safari asks its app for a token before falling back to the pairing code', async () => {
  const native = calls => ({
    send: async message => {
      calls.push(message)
      if (message.op === 'bridge.credential') return { ok: true, token: 'issued' }
      return { ok: true, code: '123456' }
    }
  })
  const calls = []
  assert.deepEqual(await background.safariBridgeCredential(native(calls), 'safari-1'), { token: 'issued' })
  assert.deepEqual(calls, [{ op: 'bridge.credential', clientId: 'safari-1' }])
})

test('an app that predates issued tokens still pairs Safari with its code', async () => {
  const calls = []
  const native = {
    send: async message => {
      calls.push(message.op)
      if (message.op === 'bridge.credential') {
        throw Object.assign(new Error('unsupported'), { code: 'unsupported_operation' })
      }
      return { ok: true, code: '654321' }
    }
  }
  assert.equal(await background.safariBridgeCredential(native, 'safari-1'), '654321')
  assert.deepEqual(calls, ['bridge.credential', 'bridge.pairingCode'])
})

test('a failure to issue a token is not mistaken for an older app', async () => {
  // Only "unsupported" means the app predates the operation. Reading the code
  // after any other failure would quietly use up a code a person may need.
  const calls = []
  const native = {
    send: async message => {
      calls.push(message.op)
      throw Object.assign(new Error('keychain'), { code: 'credential_store_failed' })
    }
  }
  await assert.rejects(background.safariBridgeCredential(native, 'safari-1'),
    error => error.code === 'credential_store_failed')
  assert.deepEqual(calls, ['bridge.credential'])
})
