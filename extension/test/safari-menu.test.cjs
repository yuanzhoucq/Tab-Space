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

test("a tab without a URL only disables Save Current Tab; the native menu still opens", async () => {
  const popups = []
  const sent = []
  nativeResponder = async message => {
    sent.push(message)
    return message.op === "ui.menu" ? { shown: true, chosen: null } : { available: true }
  }
  const api = {
    action: { setPopup: async value => popups.push(value) },
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: { query: async () => [{ id: 1, url: "", active: true }, { id: 2, url: "https://a.test" }] },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  }
  const controller = {
    listPopupTabs: async () => [{ id: 2, url: "https://a.test", isCurrent: false }]
  }
  try {
    const result = await menu.show({ api, client: { request: async () => ({ sessions: [] }) }, controller }, { url: "" })
    assert.equal(result.shown, true)
    const request = sent.find(message => message.op === "ui.menu")
    assert.equal(request.hasValidTabs, true)
    assert.equal(request.currentTabValid, false)
    assert.deepEqual(popups, [])
  } finally {
    nativeResponder = null
  }
})

test("the menu still opens when the library cannot be read", async () => {
  const sent = []
  nativeResponder = async message => {
    sent.push(message)
    return message.op === "ui.menu" ? { shown: true, chosen: null } : { available: true }
  }
  const api = {
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: { query: async () => [] },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  }
  const client = {
    request: async () => { throw Object.assign(new Error("store is loading"), { code: "internal_error" }) }
  }
  try {
    const result = await menu.show({ api, client, controller: {} }, {})
    assert.equal(result.shown, true)
    assert.deepEqual(sent.find(message => message.op === "ui.menu").sessions, [])
  } finally {
    nativeResponder = null
  }
})

test("only a menu that never appeared hands the button to the HTML popup", async () => {
  const popups = []
  const results = []
  let listener
  const api = {
    action: {
      setPopup: async value => popups.push(value),
      onClicked: { addListener: value => { listener = value } }
    },
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: { query: async () => [] },
    storage: {
      local: {
        get: async () => ({}),
        set: async values => {
          if ("tabspace-safari-menu-last-result" in values) results.push(values["tabspace-safari-menu-last-result"])
        }
      }
    }
  }
  const client = { request: async method => method === "sessions.list" ? { sessions: [] } : { value: "" } }
  menu.install({ api, client, controller: {} })
  // Let the startup probe finish its own setPopup before counting the click's.
  await new Promise(resolve => setTimeout(resolve, 0))
  popups.length = 0

  // A command that fails after the menu closed keeps the native menu.
  nativeResponder = async message => message.op === "ui.menu"
    ? { shown: true, chosen: { action: "deleteSession", sessionUuid: "missing" } }
    : { available: true }
  try {
    await listener({})
    assert.deepEqual(popups, [])
    assert.equal(results.includes("menu_fallback"), false)

    // AppKit could not draw the menu: the next click gets the popup.
    nativeResponder = async message => message.op === "ui.menu" ? { shown: false } : { available: true }
    await listener({})
    assert.deepEqual(popups, [{ popup: menu.FALLBACK_POPUP }])
    assert.equal(results.at(-1), "menu_fallback")
  } finally {
    nativeResponder = null
  }
})

test("closing to the left or right spares pinned tabs; Close Other Tabs follows the setting", async () => {
  const tabs = [
    { id: 1, index: 0, pinned: true, url: "https://pinned.test" },
    { id: 2, index: 1, pinned: false, url: "https://left.test" },
    { id: 3, index: 2, pinned: false, url: "https://active.test", active: true },
    { id: 4, index: 3, pinned: false, url: "https://right.test" }
  ]
  function api() {
    const removed = []
    return { removed, tabs: { query: async () => tabs, remove: async ids => removed.push(ids) } }
  }
  const left = api()
  assert.deepEqual(await menu.closeRelativeTabs(left, "left"), { closed: 1 })
  assert.deepEqual(left.removed, [[2]])

  const right = api()
  assert.deepEqual(await menu.closeRelativeTabs(right, "right"), { closed: 1 })
  assert.deepEqual(right.removed, [[4]])

  const other = api()
  assert.deepEqual(await menu.closeRelativeTabs(other, "other"), { closed: 3 })
  assert.deepEqual(other.removed, [[1, 2, 4]])

  const otherIgnoringPinned = api()
  assert.deepEqual(await menu.closeRelativeTabs(otherIgnoringPinned, "other", { "ignore-pinned-tabs": "true" }), { closed: 2 })
  assert.deepEqual(otherIgnoringPinned.removed, [[2, 4]])
})

test("shortcut settings are served from the cache and refreshed when it expires or is invalidated", async () => {
  const stored = {}
  const removed = []
  const requests = []
  const api = {
    storage: {
      local: {
        get: async keys => Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])),
        set: async values => Object.assign(stored, values),
        remove: async keys => { removed.push(keys); for (const key of keys) delete stored[key] }
      }
    }
  }
  const client = {
    request: async (method, params) => { requests.push(params.name); return { value: params.name === "shift-shortcuts" ? "true" : "" } }
  }
  const context = { api, client, controller: {} }

  const first = await menu.cachedSettings(context)
  assert.equal(first["shift-shortcuts"], "true")
  assert.ok(requests.includes("ignore-pinned-tabs"))
  const fetched = requests.length

  const second = await menu.cachedSettings(context)
  assert.deepEqual(second, first)
  assert.equal(requests.length, fetched)

  stored[menu.SETTINGS_CACHED_AT_KEY] = Date.now() - menu.SETTINGS_MAX_AGE_MS - 1
  await menu.cachedSettings(context)
  assert.equal(requests.length, fetched * 2)

  await menu.invalidateSettings(api)
  assert.deepEqual(removed, [[menu.SETTINGS_CACHED_AT_KEY]])
  await menu.cachedSettings(context)
  assert.equal(requests.length, fetched * 3)
})

test("menu telemetry accepts only the two rollout paths", async () => {
  const calls = []
  const client = { request: async (method, params) => { calls.push({ method, params }); return {} } }
  await menu.recordMenu(client, "native")
  await menu.recordMenu(client, "fallback")
  await menu.recordMenu(client, "popup")
  assert.deepEqual(calls, [
    { method: "diagnostics.safariMenu", params: { menu: "native" } },
    { method: "diagnostics.safariMenu", params: { menu: "fallback" } }
  ])
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
