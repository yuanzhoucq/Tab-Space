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
  assert.equal(nativeCalls.filter(call => call.op === "bridge.command").length, 1)
  // The fallback is reported to the system log, content-free.
  const traces = nativeCalls.filter(call => call.op === "diagnostics.trace")
  assert.deepEqual(traces.map(call => call.step), ["fallback", "fallback-done"])
  assert.match(traces[0].detail, /^sessions\.list after not_connected \d+ms$/)

  await assert.rejects(menu.requestWithFallback({
    request: async () => { throw Object.assign(new Error("limit"), { code: "session_limit_reached" }) }
  }, "sessions.append", {}), error => error.code === "session_limit_reached")
})

test("a connection that could not be paired falls back too: no command reached the helper", async () => {
  nativeCalls.length = 0
  const result = await menu.requestWithFallback({
    request: async () => { throw Object.assign(new Error("no code"), { code: "pairing_code_unavailable" }) }
  }, "sessions.append", { sessions: [] })
  assert.deepEqual(result, { source: "native" })
  assert.equal(nativeCalls.filter(call => call.op === "bridge.command").length, 1)
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
  const client = { request: async method => method === "sessions.listRecent" ? { sessions: [] } : { value: "" } }
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

test("open tabs belong to the switcher: the menu neither sends them nor activates one", async () => {
  const sent = []
  const updated = []
  nativeResponder = async message => {
    sent.push(message)
    return message.op === "ui.menu"
      ? { shown: true, chosen: { action: "activateTab", tabId: 2 } }
      : { available: true }
  }
  const api = {
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: {
      query: async () => [{ id: 1, url: "https://a.test", active: true }, { id: 2, url: "https://b.test" }],
      update: async (...args) => updated.push(args)
    },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  }
  try {
    await assert.rejects(
      menu.show({ api, client: { request: async () => ({ sessions: [] }) }, controller: {} }, {}),
      error => error.code === "unsupported_menu_action"
    )
    const request = sent.find(message => message.op === "ui.menu")
    assert.equal("tabs" in request, false)
    assert.deepEqual(updated, [])
  } finally {
    nativeResponder = null
  }
})

test("the menu asks for its own slice of the library and stamps the click", async () => {
  const requests = []
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
    request: async (method, params) => {
      requests.push([method, params])
      return { sessions: [{ uuid: "recent" }] }
    }
  }
  try {
    const before = Date.now()
    await menu.show({ api, client, controller: {} }, {}, before)
    assert.deepEqual(requests.filter(([method]) => method.startsWith("sessions.")), [
      ["sessions.listRecent", { limit: menu.MENU_RECENT_LIMIT }]
    ])
    const request = sent.find(message => message.op === "ui.menu")
    assert.deepEqual(request.sessions, [{ uuid: "recent" }])
    assert.equal(request.clickedAt, before)
    assert.ok(request.sentAt >= before)

    // A host too old to know the method still gets the menu, from the whole list.
    requests.length = 0
    client.request = async (method, params) => {
      requests.push([method, params])
      if (method === "sessions.listRecent") {
        throw Object.assign(new Error("old host"), { code: "unsupported_method" })
      }
      return { sessions: [{ uuid: "everything" }] }
    }
    await menu.show({ api, client, controller: {} }, {})
    assert.deepEqual(
      requests.map(([method]) => method).filter(method => method.startsWith("sessions.")),
      ["sessions.listRecent", "sessions.list"]
    )
    assert.deepEqual(sent.at(-1).sessions, [{ uuid: "everything" }])
  } finally {
    nativeResponder = null
  }
})

test("a click the handler declined is neither a failure nor a fallback", async () => {
  const popups = []
  const warnings = []
  let listener
  const api = {
    action: {
      setPopup: async value => popups.push(value),
      onClicked: { addListener: value => { listener = value } }
    },
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: { query: async () => [] },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  }
  const client = { request: async () => ({ sessions: [] }) }
  menu.install({ api, client, controller: {} })
  await new Promise(resolve => setTimeout(resolve, 0))
  popups.length = 0
  const warn = console.warn
  console.warn = (...args) => warnings.push(args)
  nativeResponder = async message => message.op === "ui.menu"
    ? { shown: false, error: { code: "menu_stale", message: "too old" } }
    : { available: true }
  try {
    await listener({})
    nativeResponder = async message => message.op === "ui.menu"
      ? { shown: false, error: { code: "menu_busy", message: "open" } }
      : { available: true }
    await listener({})
    assert.deepEqual(popups, [])
    assert.deepEqual(warnings, [])
  } finally {
    console.warn = warn
    nativeResponder = null
  }
})

test("a second click while the menu is being served does not queue another menu", async () => {
  const sent = []
  let release
  const opened = new Promise(resolve => { release = resolve })
  nativeResponder = async message => {
    sent.push(message)
    if (message.op !== "ui.menu") return { available: true }
    await opened
    return { shown: true, chosen: null }
  }
  let listener
  const api = {
    action: { setPopup: async () => {}, onClicked: { addListener: value => { listener = value } } },
    windows: { getCurrent: async () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    tabs: { query: async () => [] },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  }
  const client = { request: async () => ({ sessions: [] }) }
  menu.install({ api, client, controller: {} })
  try {
    const first = listener({})
    await new Promise(resolve => setTimeout(resolve, 0))
    const second = listener({})
    assert.equal(second, first)
    release()
    await Promise.all([first, second])
    assert.equal(sent.filter(message => message.op === "ui.menu").length, 1)

    // Once the menu has closed the next click is served again.
    await listener({})
    assert.equal(sent.filter(message => message.op === "ui.menu").length, 2)
  } finally {
    nativeResponder = null
  }
})

test("a transport failure re-probes the handler before handing over the popup", async () => {
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
  const client = { request: async () => ({ sessions: [] }) }
  menu.install({ api, client, controller: {} })
  await new Promise(resolve => setTimeout(resolve, 0))
  popups.length = 0
  const warn = console.warn
  console.warn = () => {}
  try {
    // The handler process was replaced mid-click (native.js reports the
    // rejected sendNativeMessage as a transport failure); the probe relaunches it.
    const gone = () => Object.assign(new Error("Could not find specified service"), { code: "native_transport_failed" })
    nativeResponder = async message => {
      if (message.op === "ui.menu") throw gone()
      return { available: true }
    }
    await listener({})
    assert.deepEqual(popups, [{ popup: "" }])
    assert.equal(results.includes("menu_fallback"), false)

    // Nothing answers the probe either: the popup takes over.
    popups.length = 0
    nativeResponder = async () => { throw gone() }
    await listener({})
    assert.deepEqual(popups, [{ popup: menu.FALLBACK_POPUP }])
    assert.equal(results.at(-1), "menu_fallback")
  } finally {
    console.warn = warn
    nativeResponder = null
  }
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
  const client = { request: async method => method === "sessions.listRecent" ? { sessions: [] } : { value: "" } }
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

test("a slow library does not hold the menu shut; the last slice opens it instead", async () => {
  const stored = { "tabspace-safari-menu-sessions-v1": [{ uuid: "cached", title: "Cached" }] }
  const api = {
    storage: {
      local: {
        get: async keys => Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])),
        set: async values => Object.assign(stored, values)
      }
    }
  }
  let release
  const slow = new Promise(resolve => { release = resolve })
  const slowClient = { request: async () => { await slow; return { sessions: [{ uuid: "fresh" }] } } }

  const opened = await menu.menuSessions({ api, client: slowClient })
  assert.deepEqual(opened.map(session => session.uuid), ["cached"])

  // The request was not abandoned: it refreshes the slice for the next click.
  release()
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.deepEqual(
    stored["tabspace-safari-menu-sessions-v1"].map(session => session.uuid),
    ["fresh"]
  )

  const fastClient = { request: async () => ({ sessions: [{ uuid: "now" }] }) }
  assert.deepEqual(
    (await menu.menuSessions({ api, client: fastClient })).map(session => session.uuid),
    ["now"]
  )
})

test("a library that cannot be read falls back to the last slice, then to nothing", async () => {
  const stored = {}
  const api = {
    storage: {
      local: {
        get: async keys => Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])),
        set: async values => Object.assign(stored, values)
      }
    }
  }
  const failing = { request: async () => { throw Object.assign(new Error("cold"), { code: "internal_error" }) } }
  nativeResponder = async () => ({ ok: false, error: { code: "internal_error", message: "cold" } })
  try {
    assert.deepEqual(await menu.menuSessions({ api, client: failing }), [])
    stored["tabspace-safari-menu-sessions-v1"] = [{ uuid: "cached" }]
    assert.deepEqual(
      (await menu.menuSessions({ api, client: failing })).map(session => session.uuid),
      ["cached"]
    )
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
