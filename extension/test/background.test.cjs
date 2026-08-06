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
        { id: 9, windowId: 2, title: 'Settings', url: 'chrome://settings' }
      ]
    },
    updateTab: async (id, properties) => calls.push(['update', id, properties]),
    focusWindow: async id => calls.push(['focus', id])
  }
  const controller = background.createController({ browserApi, client: {} })

  assert.deepEqual((await controller.listSwitcherTabs()).map(tab => tab.id), [4, 8])
  await controller.activateSwitcherTab(8, 2)
  assert.deepEqual(calls.slice(-2), [
    ['update', 8, { active: true }],
    ['focus', 2]
  ])
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

test('maps every dashboard data command onto protocol v2 methods', () => {
  assert.equal(background.dashboardCommandToOperation({ cmd: 'CheckBookmarks' }).method, 'sessions.list')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'AppendSessions', bookmarks: '[]' }).method, 'sessions.append')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'UpdateSession', bookmarks: [] }).method, 'sessions.update')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'DeleteSession', bookmarks: [] }).method, 'sessions.delete')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'MergeSessions', bookmarks: [] }).method, 'sessions.merge')
  assert.equal(background.dashboardCommandToOperation({ cmd: 'UpSession', bookmarks: [] }).method, 'sessions.up')
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
  assert.deepEqual(background.dashboardMessageForEvent({ event: 'sessions.changed', revision: 9 }), {
    cmd: 'SessionsChangedRemotely',
    revision: 9
  })
})

test('maps protocol v2 AI and subscription results back to dashboard messages', () => {
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
    ['update', 7, { active: true }]
  ])
  assert.deepEqual(result, { reused: true })
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

test('uses the white PDF-derived toolbar icon only for dark browser chrome', () => {
  assert.deepEqual(background.toolbarIconPaths('light'), {
    16: 'toolbar-16.png',
    32: 'toolbar-32.png',
    48: 'toolbar-48.png',
    128: 'toolbar-128.png'
  })
  assert.deepEqual(background.toolbarIconPaths('dark'), {
    16: 'toolbar-light-16.png',
    32: 'toolbar-light-32.png',
    48: 'toolbar-light-48.png',
    128: 'toolbar-light-128.png'
  })
})

test('builds valid browser-specific Manifest V3 packages', () => {
  execFileSync(process.execPath, [join(extensionRoot, 'build.mjs'), 'all'], { stdio: 'pipe' })
  const chrome = JSON.parse(readFileSync(join(extensionRoot, 'dist/chrome/manifest.json'), 'utf8'))
  const edge = JSON.parse(readFileSync(join(extensionRoot, 'dist/edge/manifest.json'), 'utf8'))
  const firefox = JSON.parse(readFileSync(join(extensionRoot, 'dist/firefox/manifest.json'), 'utf8'))

  assert.equal(chrome.manifest_version, 3)
  assert.equal(chrome.background.service_worker, 'background.js')
  assert.equal(chrome.action.default_icon['16'], 'toolbar-16.png')
  assert.equal(chrome.permissions.includes('offscreen'), true)
  assert.equal(edge.permissions.includes('offscreen'), true)
  assert.deepEqual(edge.background, chrome.background)
  assert.deepEqual(firefox.background, { scripts: ['background.js'] })
  assert.equal(firefox.browser_specific_settings.gecko.id, 'extension@mytab.space')
  assert.deepEqual(
    firefox.browser_specific_settings.gecko.data_collection_permissions,
    { required: ['none'] }
  )
  assert.equal(firefox.permissions.includes('offscreen'), false)
  assert.deepEqual(firefox.action.theme_icons, [
    { size: 16, dark: 'toolbar-16.png', light: 'toolbar-light-16.png' },
    { size: 32, dark: 'toolbar-32.png', light: 'toolbar-light-32.png' }
  ])

  for (const manifest of [chrome, edge, firefox]) {
    assert.deepEqual(manifest.content_scripts[0].matches, ['https://app.mytab.space/*'])
    assert.equal(manifest.permissions.includes('tabs'), true)
    assert.equal(manifest.permissions.includes('storage'), true)
  }
  for (const target of ['chrome', 'edge', 'firefox']) {
    assert.equal(existsSync(join(extensionRoot, `dist/packages/tab-space-1.2.0-${target}.zip`)), true)
    for (const size of [16, 32, 48, 128]) {
      assert.deepEqual(
        readFileSync(join(extensionRoot, `dist/${target}/toolbar-${size}.png`)),
        readFileSync(join(extensionRoot, `assets/toolbar-${size}.png`))
      )
      assert.deepEqual(
        readFileSync(join(extensionRoot, `dist/${target}/toolbar-light-${size}.png`)),
        readFileSync(join(extensionRoot, `assets/toolbar-light-${size}.png`))
      )
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
  // Multi-browser support is a Pro benefit enforced by the helper's bridge. The
  // extension must not react by retrying the handshake or showing the pairing
  // screen: the code would be accepted and every request refused afterwards.
  const backgroundSource = readFileSync(join(extensionRoot, 'src/background.js'), 'utf8')
  const popup = readFileSync(join(extensionRoot, 'src/popup.js'), 'utf8')

  const terminalCodes = backgroundSource.slice(
    backgroundSource.indexOf('if (error && ['),
    backgroundSource.indexOf('].includes(error.code))')
  )
  assert.equal(terminalCodes.includes('"pro_required"'), true)

  const proBranch = popup.indexOf('response.error.code === "pro_required"')
  const pairingBranch = popup.indexOf('["pairing_required", "authentication_failed"].includes(response.error.code)')
  assert.notEqual(proBranch, -1)
  assert.notEqual(pairingBranch, -1)
  assert.equal(proBranch < pairingBranch, true, 'the Pro check must precede the pairing fallback')
  assert.equal(popup.includes('strings.proRequired'), true)
  assert.equal(popup.includes('proRequired: "Multi-browser support is included with Tab Space Pro.'), true)
  assert.equal(popup.includes('proRequired: "多浏览器支持包含在 Tab Space Pro 中。'), true)
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

test('reconnects automatically when the helper drops the socket', async () => {
  FakeReconnectWebSocket.instances = []
  const storage = {
    get: async () => ({}),
    set: async () => {},
    remove: async () => {}
  }
  const client = new background.LocalBridgeClient({
    WebSocket: FakeReconnectWebSocket,
    storage,
    client: { browser: 'chrome' },
    reconnectDelays: [10, 10]
  })

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
