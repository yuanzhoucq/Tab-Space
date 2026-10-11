const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const test = require("node:test")
const vm = require("node:vm")

const source = readFileSync(join(__dirname, "../src/content-script.js"), "utf8")
// What build.mjs ships in the Safari package, the only one with a page-side
// listener for the direct bridge's document events.
const safariSource = source.replace("const SAFARI_DIRECT_BRIDGE = false", "const SAFARI_DIRECT_BRIDGE = true")
const settle = () => new Promise(resolve => setImmediate(resolve))

// The dashboard page as the content script sees it: a window it posts to, and
// the extension APIs it talks to the background through.
function dashboard({ connectResponse, requestResponse, script = source }) {
  const posted = []
  const documentEvents = []
  const portListeners = []
  const runtimeListeners = []
  const windowListeners = []
  const window = {
    location: { origin: "https://app.mytab.space", protocol: "https:", host: "app.mytab.space" },
    addEventListener(type, listener) { if (type === "message") windowListeners.push(listener) },
    postMessage(message) { posted.push(message) }
  }
  window.top = window
  const browser = {
    runtime: {
      sendMessage: async message => {
        if (message.type === "dashboard.connect") return connectResponse()
        if (message.type === "dashboard.request" && requestResponse) return requestResponse(message.message)
        return { ok: true, result: {} }
      },
      connect: () => ({ onMessage: { addListener: listener => portListeners.push(listener) } }),
      onMessage: { addListener: listener => runtimeListeners.push(listener) }
    }
  }
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail }
  }
  const document = { addEventListener() {}, dispatchEvent(event) { documentEvents.push(event) } }
  vm.runInNewContext(script, { window, document, browser, CustomEvent })
  return {
    posted,
    documentEvents,
    // The dashboard asking for something through window.postMessage.
    request: (message, requestId) => windowListeners.forEach(listener => listener({
      source: window,
      origin: window.location.origin,
      data: { channel: "tabspace-webextension-v2", source: "dashboard", type: "request", requestId, message }
    })),
    connectedNotices: () => posted.filter(message => message.type === "connected"),
    errors: () => posted.filter(message => message.type === "connection-error"),
    fromPort: payload => portListeners.forEach(listener => listener(payload)),
    fromRuntime: payload => runtimeListeners.forEach(listener => listener(payload))
  }
}

test("tells the dashboard once that the bridge is up, however many announcements arrive", async () => {
  // The background announces every successful handshake and the page's own
  // connect request answers as well; both used to reach the page, and each one
  // made the dashboard load its whole library.
  const page = dashboard({
    connectResponse: async () => ({ ok: true, result: { connected: true, capabilities: ["a"] } })
  })
  page.fromPort({ type: "bridge-connected", result: { connected: true, capabilities: ["a"] } })
  page.fromRuntime({ type: "dashboard.bridgeConnected", result: { connected: true, capabilities: ["a"] } })
  await settle()
  assert.equal(page.connectedNotices().length, 1)
})

test("connects a dashboard that was unpaired when the popup pairs the browser", async () => {
  // The announcement arrives through tabs.sendMessage, because the port opened
  // at page load does not survive the background going idle.
  const page = dashboard({
    connectResponse: async () => ({ ok: false, error: { code: "pairing_required" } })
  })
  await settle()
  assert.equal(page.errors().length, 1)
  assert.equal(page.connectedNotices().length, 0)

  page.fromRuntime({ type: "dashboard.bridgeConnected", result: { connected: true, capabilities: ["ai.v1"] } })
  assert.equal(page.connectedNotices().length, 1)
  assert.deepEqual(page.connectedNotices()[0].bridgeInfo.capabilities, ["ai.v1"])
})

const library = { cmd: "ReturnBookmarks", bookmarks: [{ uuid: "s1" }], value: "[]" }

test("hands the library to a Chrome, Edge or Firefox dashboard on the production host", async () => {
  // The reply used to go out as a document event that only the Safari
  // package listens for: the dashboard said "connected" and never loaded.
  const page = dashboard({
    connectResponse: async () => ({ ok: true, result: { connected: true, capabilities: [] } }),
    requestResponse: async () => ({ ok: true, result: { messages: [library] } })
  })
  page.request({ cmd: "CheckBookmarks" }, "dashboard-1")
  await settle()

  const replies = page.posted.filter(message => message.type === "native-message")
  assert.equal(replies.length, 1)
  assert.equal(replies[0].message.cmd, "ReturnBookmarks")
  assert.equal(page.documentEvents.filter(event => event.type === "tabspace:webextension:message").length, 0)
  assert.equal(page.posted.some(message => message.type === "request-complete" && message.requestId === "dashboard-1"), true)
})

test("keeps the direct bridge for the Safari package", async () => {
  const page = dashboard({
    script: safariSource,
    connectResponse: async () => ({ ok: true, result: { connected: true, capabilities: [] } }),
    requestResponse: async () => ({ ok: true, result: { messages: [library] } })
  })
  page.request({ cmd: "CheckBookmarks" }, "dashboard-1")
  await settle()

  const events = page.documentEvents.filter(event => event.type === "tabspace:webextension:message")
  assert.equal(events.length, 1)
  assert.equal(JSON.parse(events[0].detail).name, "ReturnBookmarks")
  assert.equal(page.posted.filter(message => message.type === "native-message").length, 0)
})
