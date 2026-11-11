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
  let reply = options.reply || (() => ({ archived: true }))
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
      return reply(payload)
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
    replyWith(next) { reply = next },
    get clock() { return clock },
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

const titles = payload => payload.windows.map(window => window.pages.map(page => page.title))
const carried = payload => payload.windows.map(window => window.pages.map(page => page.carried))
const last = h => h.sent[h.sent.length - 1]
const MINUTE = 60_000

async function open(h, tabs) {
  h.setTabs(tabs)
  h.tracker.tabChanged()
  await h.advance(1000)
}

test('pages opened in a period stay once closed; earlier ones only while open', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 })] })
  await h.tracker.start(false)
  await open(h, [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 }), tab(3, 10, 'c', { index: 2 })])
  h.tracker.tabRemoved(3, { windowId: 10, isWindowClosing: false })
  h.tracker.tabRemoved(2, { windowId: 10, isWindowClosing: false })
  h.setTabs([tab(1, 10, 'a', { index: 0 })])
  await h.advance(3000)
  assert.deepEqual(titles(last(h)), [['a', 'c']])
  assert.deepEqual(carried(last(h)), [[true, false]])
  assert.equal(last(h).windows[0].closed, false)
})

test('thirty quiet minutes end a period; the next one carries what is still open', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a', { index: 0 })] })
  await h.tracker.start(false)
  await open(h, [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 })])
  const openedB = h.clock
  await h.advance(3000)
  const first = last(h)
  assert.deepEqual(titles(first), [['a', 'b']])

  await h.advance(31 * MINUTE)
  await open(h, [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 }), tab(3, 10, 'c', { index: 2 })])
  await h.advance(3000)
  const ended = h.sent.filter(payload => payload.id === first.id)
  assert.equal(ended[ended.length - 1].endedAt, openedB, 'the first period ends at its last activity')
  const second = last(h)
  assert.notEqual(second.id, first.id)
  assert.deepEqual(titles(second), [['a', 'b', 'c']])
  assert.deepEqual(carried(second), [[true, true, false]])
})

test('switching tabs keeps a period going without adding pages', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  await h.advance(3000)
  const first = last(h)
  for (let i = 0; i < 3; i += 1) {
    await h.advance(20 * MINUTE)
    h.tracker.activity()
  }
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 10, 'c')])
  await h.advance(3000)
  assert.equal(last(h).id, first.id)
  assert.deepEqual(titles(last(h)), [['a', 'b', 'c']])
})

test('activity alone moves the end of the period, written within a minute', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  await h.advance(3000)
  await h.advance(5 * MINUTE)
  h.tracker.activity()
  const at = h.clock
  await h.advance(3000)
  assert.notEqual(last(h).endedAt, at, 'not written at once')
  await h.advance(MINUTE)
  assert.equal(last(h).endedAt, at)
})

test('a closed window keeps the pages it had, earlier ones included', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 }), tab(3, 11, 'c')] })
  await h.tracker.start(false)
  for (const id of [2, 1]) h.tracker.tabRemoved(id, { windowId: 10, isWindowClosing: true })
  h.tracker.windowRemoved(10)
  h.setTabs([tab(3, 11, 'c')])
  await h.advance(3000)
  assert.deepEqual(titles(last(h)), [['a', 'b'], ['c']])
  assert.deepEqual(last(h).windows.map(window => window.closed), [true, false])
})

test('a window whose tabs closed without tab events is closed from the period', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 11, 'c')] })
  await h.tracker.start(false)
  h.tracker.windowRemoved(10)
  await h.advance(3000)
  assert.deepEqual(titles(last(h)), [['a', 'b'], ['c']])
  assert.equal(last(h).windows[0].closed, true)
})

test('a refresh that still lists a closed tab does not bring it back', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b')] })
  await h.tracker.start(false)
  h.tracker.tabRemoved(2, { windowId: 10, isWindowClosing: false })
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  await h.advance(3000)
  assert.deepEqual(titles(last(h)), [['a']])
})

test('a tab keeps its last address, and an earlier page that moves counts as new', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  await open(h, [tab(1, 10, 'x')])
  await h.advance(3000)
  assert.deepEqual(titles(last(h)), [['x']])
  assert.deepEqual(carried(last(h)), [[false]])
})

test('a page moved to another window is filed under that window', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'b')] })
  await h.tracker.start(false)
  await open(h, [tab(1, 10, 'a'), tab(2, 11, 'b')])
  h.tracker.windowRemoved(10)
  await h.advance(3000)
  assert.deepEqual(titles(last(h)), [['a'], ['b']])
  assert.deepEqual(last(h).windows.map(window => window.closed), [true, false])
})

test('tabs Tab Space closes itself, pinned and private tabs are left out', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a'), tab(2, 10, 'p', { pinned: true }), tab(3, 12, 'i', { incognito: true })] })
  await h.tracker.start(false)
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'p', { pinned: true }), tab(3, 12, 'i', { incognito: true }), tab(4, 10, 'd')])
  h.tracker.suppress([4])
  h.tracker.tabRemoved(4, { windowId: 10, isWindowClosing: false })
  await h.advance(3000)
  assert.deepEqual(titles(last(h)), [['a']])
})

test('a relaunch ends the last run\'s period as Safari quit and carries the restored tabs', async () => {
  const first = harness({ tabs: [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 })] })
  await first.tracker.start(false)
  await open(first, [tab(1, 10, 'a', { index: 0 }), tab(2, 10, 'b', { index: 1 }), tab(3, 10, 'c', { index: 2 })])
  // Quit before the write timer fired.
  const lastRun = JSON.parse(JSON.stringify(first.store['tabspace-archive-period']))

  const second = harness({ stored: first.store, clock: first.clock + 5 * MINUTE, tabs: [tab(9, 20, 'a')] })
  // An event from before `start` waits for it.
  second.tracker.tabRemoved(1, { windowId: 10, isWindowClosing: false })
  await second.tracker.start(true)
  assert.equal(second.sent[0].id, lastRun.id)
  assert.deepEqual(titles(second.sent[0]), [['a', 'b', 'c']])
  assert.equal(second.sent[0].windows[0].closed, true)

  // Restored windows arrive over a few seconds.
  await open(second, [tab(9, 20, 'a', { index: 0 }), tab(10, 20, 'b', { index: 1 })])
  await second.advance(20_000)
  await open(second, [tab(9, 20, 'a', { index: 0 }), tab(10, 20, 'b', { index: 1 }), tab(11, 20, 'd', { index: 2 })])
  await second.advance(3000)
  assert.notEqual(last(second).id, lastRun.id)
  assert.deepEqual(titles(last(second)), [['a', 'b', 'd']])
  assert.deepEqual(carried(last(second)), [[true, true, false]])
})

test('a period the user deleted while it went on gives way to a new one', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  h.replyWith(() => ({ archived: false, dismissed: true }))
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  await h.advance(3000)
  const dismissed = last(h)
  h.replyWith(() => ({ archived: true }))
  h.tracker.tabRemoved(2, { windowId: 10, isWindowClosing: false })
  await h.advance(3000)
  assert.notEqual(last(h).id, dismissed.id)
  // b closed after the new period began, as a page from before it.
  assert.deepEqual(titles(last(h)), [['a']])
  assert.deepEqual(carried(last(h)), [[true]])
})

test('a write the app could not take waits, one per period', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  h.fail(Object.assign(new Error('offline'), { code: 'bridge_unavailable' }))
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  await h.advance(3000)
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b'), tab(3, 10, 'c')])
  await h.advance(3000)
  assert.equal(h.store['tabspace-archive-outbox'].length, 1)
  assert.deepEqual(titles(h.store['tabspace-archive-outbox'][0]), [['a', 'b', 'c']])

  h.fail(null)
  await h.tracker.retryOutbox()
  assert.equal(h.sent.length, 1)
  assert.deepEqual(h.store['tabspace-archive-outbox'], [])
  assert.equal(h.captured, 1)
})

test('a waiting write is retried on tab changes, at most once a minute', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  h.fail(Object.assign(new Error('offline'), { code: 'bridge_unavailable' }))
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  await h.advance(3000)
  h.fail(null)
  h.tracker.tabChanged()
  await h.advance(1000)
  assert.deepEqual(h.sent, [], 'too soon after the failed try')
  await h.advance(MINUTE)
  h.tracker.tabChanged()
  await h.advance(1000)
  assert.equal(h.sent.length, 1)
})

test('an app without the archive drops writes instead of hoarding them', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  h.fail(Object.assign(new Error('old app'), { code: 'unsupported_method' }))
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  await h.advance(3000)
  assert.deepEqual(h.store['tabspace-archive-outbox'], [])
})

test('a write is put in the outbox before it is sent', async () => {
  const h = harness({ tabs: [tab(1, 10, 'a')] })
  await h.tracker.start(false)
  h.hang()
  await open(h, [tab(1, 10, 'a'), tab(2, 10, 'b')])
  h.advance(3000)
  for (let i = 0; i < 4; i += 1) await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.store['tabspace-archive-outbox'].length, 1)
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

test('an archive change reaches open dashboards as ArchiveChanged', () => {
  assert.deepEqual(background.dashboardMessageForEvent({ event: 'archive.changed' }), { cmd: 'ArchiveChanged' })
})
