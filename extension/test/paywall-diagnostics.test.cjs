const assert = require('node:assert/strict')
const test = require('node:test')
const { dashboardCommandToOperation: route } = require('../src/background.js')
test('AI adoption metadata survives the native bridge with a closed vocabulary', () => {
  for (const kind of ['enhance', 'orphan_tags']) {
    assert.equal(route({ cmd: 'UpdateSession', bookmarks: [], aiApplied: kind }).params.aiApplied, kind)
  }
  assert.equal(route({ cmd: 'UpdateSession', bookmarks: [], aiApplied: 'private content' }).params.aiApplied, undefined)
  assert.equal(route({ cmd: 'UpdateSession', bookmarks: [] }).params.aiApplied, undefined)
  assert.equal(route({ cmd: 'MergeSessions', bookmarks: [], aiApplied: true }).params.aiApplied, true)
})

test('purchase source is forwarded without arbitrary page content', () => {
  for (const source of ['ai_quota', 'ai_action', 'dashboard_session_limit']) {
    assert.equal(route({cmd: 'PurchaseSubscription', source}).params.source, source)
  }
  assert.equal(route({cmd: 'PurchaseSubscription', source: 'https://private.example/'}).params.source, undefined)
})
