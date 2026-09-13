const assert = require("node:assert/strict")
const test = require("node:test")

const nativeCalls = []
let nativeResponder = null
global.TabSpaceSafariNative = {
  send: async message => {
    nativeCalls.push(message)
    if (nativeResponder) return nativeResponder(message)
    if (message.op === "ui.probe") return { available: true }
    if (message.op === "bridge.command") return { ok: true, result: { source: "native" } }
    return { ok: true }
  }
}
const menu = require("../src/safari/menu.js")

function probeApi(forced = false) {
  const popups = []
  return {
    popups,
    action: { setPopup: async value => popups.push(value) },
    storage: {
      local: {
        get: async () => ({ "tabspace-force-popup-fallback": forced })
      }
    }
  }
}

test("uses native fallback only for WebSocket transport failures", async () => {
  nativeCalls.length = 0
  const result = await menu.requestWithFallback({
    request: async () => { throw Object.assign(new Error("offline"), { code: "not_connected" }) }
  }, "sessions.list", {})
  assert.deepEqual(result, { source: "native" })
  assert.equal(nativeCalls.at(-1).op, "bridge.command")

  await assert.rejects(menu.requestWithFallback({
    request: async () => { throw Object.assign(new Error("limit"), { code: "session_limit_reached" }) }
  }, "sessions.append", {}), error => error.code === "session_limit_reached")
})

test("setPopup switches in both native-menu and forced-fallback directions", async () => {
  const nativeApi = probeApi(false)
  assert.equal(await menu.probe(nativeApi), true)
  assert.deepEqual(nativeApi.popups, [{ popup: "" }])

  const fallbackApi = probeApi(true)
  assert.equal(await menu.probe(fallbackApi), false)
  assert.deepEqual(fallbackApi.popups, [{ popup: menu.FALLBACK_POPUP }])
})

test("action listener returns the native-menu workflow promise", async () => {
  let listener
  const api = {
    action: {
      setPopup: async () => {},
      onClicked: { addListener: value => { listener = value } }
    },
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: { query: async () => [] },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  }
  const client = { request: async method => method === "sessions.list" ? { sessions: [] } : { value: "" } }
  menu.install({ api, client, controller: {} })

  assert.equal(typeof listener, "function")
  const workflow = listener({})
  assert.equal(typeof workflow.then, "function")
  await workflow
})

test("recycles the possibly stale WebSocket before performing a menu action", async () => {
  let closed = false
  nativeResponder = async message => message.op === "ui.menu"
    ? { shown: true, chosen: { action: "save", closeTabs: true } }
    : { available: true }
  const api = {
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: { query: async () => [] },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  }
  const client = {
    request: async () => ({ sessions: [] }),
    close: () => { closed = true }
  }
  const controller = {
    saveTabIds: async () => {
      assert.equal(closed, true)
      return { savedCount: 1 }
    }
  }

  try {
    const result = await menu.show({ api, client, controller }, {})
    assert.equal(result.result.savedCount, 1)
  } finally {
    nativeResponder = null
  }
})

test("restore uses bounded concurrency and opens the first URL active", async () => {
  let active = 0
  let peak = 0
  const created = []
  const api = {
    tabs: {
      create: async properties => {
        active += 1
        peak = Math.max(peak, active)
        created.push(properties)
        await new Promise(resolve => setTimeout(resolve, 1))
        active -= 1
      }
    }
  }
  assert.deepEqual(await menu.restoreUrls(api, ["https://a.test", "https://b.test", "https://c.test"], 2), {
    restoredCount: 3
  })
  assert.equal(peak, 2)
  assert.deepEqual(created.map(item => item.active), [true, false, false])
})
