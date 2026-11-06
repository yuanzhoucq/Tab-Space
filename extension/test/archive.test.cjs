const assert = require('node:assert/strict')
const test = require('node:test')

const background = require('../src/background.js')

// A tracker on fake storage, a fake clock and timers that only fire when the
// test says so.
function harness(options = {}) {
  const store = { ...(options.stored || {}) }
  let clock = options.clock || 1_000_000
  let tabs = options.tabs || []
  const timers = []
  const sent = []
  let failing = options.failing || null
  let hanging = false
  let captured = 0
  const tracker = background.createArchiveTracker({
    storage: {
      async get(key) { return { [key]: store[key] } },
      async set(values) { Object.assign(store, JSON.parse(JSON.stringify(values))) }
    },
    queryTabs: async () => tabs,
    send: async payload => {
      if (hanging) return new Promise(() => {})
      if (failing) throw failing
      sent.push(payload)
    },
    onCaptured: () => { captured += 1 },
    now: () => clock,
    setTimer: (callback, delay) => {
      const timer = { callback, at: clock + delay, done: false }
      timers.push(timer)
      return timer
    },
    clearTimer: timer => { if (timer) timer.done = true }
  })
  return {
    tracker,
    store,
    sent,
    setTabs(next) { tabs = next },
    fail(error) { failing = error },
    hang() { hanging = true },
    get captured() { return captured },
    async advance(milliseconds) {
      // Let queued events run (and arm their timers) before time moves.
      await tracker.idle()
      clock += milliseconds
      for (const timer of timers) {
        if (!timer.done && timer.at <= clock) {
          timer.done = true
          timer.callback()
        }
      }
      await tracker.idle()
      await tracker.idle()
    }
  }
}

const tab = (id, windowId, path, extra = {}) =>
  ({ id, windowId, url: `https://example.com/${path}`, title: path, ...extra })

test('a closed window is archived once, with its tabs in order', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 11, 'c')] })
  await h.tracker.start(false)
  h.tracker.tabRemoved(1, { windowId: 10, isWindowClosing: true })
  h.tracker.tabRemoved(2, { windowId: 10, isWindowClosing: true })
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  assert.deepEqual(h.sent, [{
    reason: 'window',
    sites: [{ title: 'a', url: 'https://example.com/a' }, { title: 'b', url: 'https://example.com/b' }]
  }])
})

test('a window is archived in tab order although its tabs close from the last one', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 }), tab(3, 10, 'c', { index: 2 })] })
  await h.tracker.start(false)
  for (const id of [3, 2, 1]) h.tracker.tabRemoved(id, { windowId: 10, isWindowClosing: true })
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  assert.deepEqual(h.sent[0].sites.map(site => site.title), ['a', 'b', 'c'])
})

test('a window whose tabs closed without tab events still comes from the cache', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b')] })
  await h.tracker.start(false)
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].reason, 'window')
  assert.equal(h.sent[0].sites.length, 2)
})

test('single closes are left to history; three quick ones are a burst', async () => {
  const h = harness({ tabs: [1, 2, 3, 4, 5].map(id => tab(id, 10, `p${id}`)) })
  await h.tracker.start(false)
  h.tracker.tabRemoved(1, { windowId: 10 })
  await h.advance(5000)
  assert.deepEqual(h.sent, [])

  h.tracker.tabRemoved(2, { windowId: 10 })
  await h.advance(300)
  h.tracker.tabRemoved(3, { windowId: 10 })
  await h.advance(300)
  h.tracker.tabRemoved(4, { windowId: 10 })
  await h.advance(2500)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].reason, 'burst')
  assert.deepEqual(h.sent[0].sites.map(site => site.title), ['p2', 'p3', 'p4'])
})

test('tabs Tab Space closes itself, pinned and private tabs are never archived', async () => {
  const h = harness({
    tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 10, 'pinned', { pinned: true }),
      tab(4, 10, 'private', { incognito: true }), tab(5, 10, 'c')]
  })
  await h.tracker.start(false)
  h.tracker.suppress([1, 2])
  for (const id of [1, 2, 3, 4]) h.tracker.tabRemoved(id, { windowId: 10 })
  await h.advance(2500)
  assert.deepEqual(h.sent, [])
})

test('after a relaunch, remembered tabs that did not come back are archived', async () => {
  const first = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 10, 'c')] })
  await first.tracker.start(false)

  // Same storage, new browser run: only "a" was restored.
  const second = harness({ stored: first.store, clock: 1_000_000 + 60_000, tabs: [tab(7, 20, 'a')] })
  await second.tracker.start(true)
  assert.deepEqual(second.sent, [], 'waits for the relaunch to settle')
  await second.advance(16_000)
  assert.equal(second.sent.length, 1)
  assert.equal(second.sent[0].reason, 'restart')
  assert.deepEqual(second.sent[0].sites.map(site => site.title), ['b', 'c'])
})

test('a capture the app could not take waits for the next event', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 11, 'c'), tab(4, 11, 'd')] })
  await h.tracker.start(false)
  h.fail(Object.assign(new Error('offline'), { code: 'bridge_unavailable' }))
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  assert.equal(h.store['tabspace-archive-outbox'].length, 1)

  h.fail(null)
  h.tracker.windowRemoved(11)
  await h.advance(2500)
  assert.deepEqual(h.sent.map(payload => payload.sites[0].title), ['a', 'c'])
  assert.deepEqual(h.store['tabspace-archive-outbox'], [])
})

test('an app without the archive drops captures instead of hoarding them', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b')] })
  await h.tracker.start(false)
  h.fail(Object.assign(new Error('old app'), { code: 'unsupported_method' }))
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  assert.deepEqual(h.store['tabspace-archive-outbox'], [])
})

test('maps the dashboard archive commands and answers', () => {
  assert.deepEqual(background.dashboardCommandToOperation({ cmd: 'ListArchive', beforeDay: '2026-11-01' }),
    { kind: 'native', method: 'archive.list', params: { beforeDay: '2026-11-01' } })
  assert.deepEqual(background.dashboardCommandToOperation({ cmd: 'DeleteArchiveEntries', ids: ['x', 3] }),
    { kind: 'native', method: 'archive.delete', params: { ids: ['x'] } })
  const keep = background.dashboardCommandToOperation({ cmd: 'KeepArchiveEntry', id: 'x', title: 'T' })
  assert.deepEqual(keep, { kind: 'native', method: 'archive.keep', params: { id: 'x', title: 'T' } })

  // A search rides along, trimmed, on every command that answers with a list.
  assert.deepEqual(background.dashboardCommandToOperation({ cmd: 'ListArchive', query: ' swift ' }),
    { kind: 'native', method: 'archive.list', params: { query: 'swift' } })
  assert.deepEqual(background.dashboardCommandToOperation({ cmd: 'ListArchive', query: '  ' }),
    { kind: 'native', method: 'archive.list', params: {} })
  assert.deepEqual(background.dashboardCommandToOperation({ cmd: 'DeleteArchiveEntries', ids: ['x'], query: 'swift' }),
    { kind: 'native', method: 'archive.delete', params: { ids: ['x'], query: 'swift' } })
  assert.deepEqual(background.dashboardCommandToOperation({ cmd: 'KeepArchiveEntry', id: 'x', title: '', query: 'swift' }),
    { kind: 'native', method: 'archive.keep', params: { id: 'x', title: '', query: 'swift' } })

  const archive = { entries: [], enabled: true }
  assert.deepEqual(background.dashboardMessagesFor({ method: 'archive.list' }, archive),
    [{ cmd: 'ReturnArchive', archive }])
  const messages = background.dashboardMessagesFor(keep, { sessions: [], archive })
  assert.deepEqual(messages.map(message => message.cmd), ['ReturnBookmarks', 'ReturnArchive', 'ArchiveKept'])
  assert.equal(messages[2].ok, true)
})

test('a refresh that runs between a close and its event does not lose the window', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 11, 'c')] })
  await h.tracker.start(false)
  // The window is already gone when the refresh asks; its events come after.
  h.setTabs([tab(3, 11, 'c')])
  h.tracker.tabChanged()
  await h.advance(1000)
  h.tracker.tabRemoved(1, { windowId: 10, isWindowClosing: true })
  h.tracker.tabRemoved(2, { windowId: 10, isWindowClosing: true })
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  assert.equal(h.sent.length, 1)
  assert.deepEqual(h.sent[0].sites.map(site => site.title), ['a', 'b'])
})

test('a window closed just before quitting is archived on the next launch', async () => {
  const first = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 11, 'c')] })
  await first.tracker.start(false)
  first.tracker.windowRemoved(10)
  await first.tracker.idle()
  // Quit before the flush timer fired.

  const second = harness({ stored: first.store, clock: 1_000_000 + 60_000, tabs: [tab(9, 20, 'c')] })
  await second.tracker.start(true)
  assert.equal(second.sent.length, 1)
  assert.equal(second.sent[0].reason, 'window')
  assert.deepEqual(second.sent[0].sites.map(site => site.title), ['a', 'b'])
  await second.advance(16_000)
  assert.equal(second.sent.length, 1, 'the restored tab is not a restart loss')
})

test('a capture is written down before it is sent', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b')] })
  await h.tracker.start(false)
  h.hang()
  h.tracker.windowRemoved(10)
  await h.tracker.idle()
  h.advance(2500)
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.store['tabspace-archive-outbox'].length, 1)
  assert.equal(h.store['tabspace-archive-closes'].length, 0)
})

test('a waiting capture is retried on tab changes, at most once a minute', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 11, 'c')] })
  await h.tracker.start(false)
  h.fail(Object.assign(new Error('offline'), { code: 'bridge_unavailable' }))
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  h.fail(null)

  h.tracker.tabChanged()
  await h.advance(1000)
  assert.deepEqual(h.sent, [], 'too soon after the failed try')

  await h.advance(60_000)
  h.tracker.tabChanged()
  await h.advance(1000)
  assert.equal(h.sent.length, 1)
  assert.deepEqual(h.store['tabspace-archive-outbox'], [])
  assert.equal(h.captured, 1)
})

test('opening the library delivers a waiting capture first', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b')] })
  await h.tracker.start(false)
  h.fail(Object.assign(new Error('offline'), { code: 'bridge_unavailable' }))
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  h.fail(null)
  await h.tracker.retryOutbox()
  assert.equal(h.sent.length, 1)
})

test('moving a tab to another window keeps it out of the old window\'s capture', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 10, 'c')] })
  await h.tracker.start(false)
  h.setTabs([tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 11, 'c')])
  h.tracker.tabChanged() // onAttached
  await h.advance(1000)
  h.tracker.windowRemoved(10)
  await h.advance(2500)
  assert.deepEqual(h.sent[0].sites.map(site => site.title), ['a', 'b'])
})

test('an archive change reaches open dashboards as ArchiveChanged', () => {
  assert.deepEqual(background.dashboardMessageForEvent({ event: 'archive.changed' }), { cmd: 'ArchiveChanged' })
})
