const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const test = require("node:test")
const vm = require("node:vm")

const source = readFileSync(join(__dirname, "../src/safari/content-script.js"), "utf8")

class Events {
  constructor() { this.listeners = new Map() }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || []
    listeners.push(listener)
    this.listeners.set(name, listeners)
  }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event)
  }
}

class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}

function context(host = "app.mytab.space", protocol = "https:") {
  const window = new Events()
  const document = new Events()
  window.top = window
  return { window, document, location: { host, protocol }, CustomEvent }
}

test("installs the exact protocol-v1 dashboard bridge and preserves command names", () => {
  const sandbox = context()
  const commands = []
  sandbox.document.addEventListener("tabspace:webextension:command", event => {
    commands.push(JSON.parse(event.detail))
  })
  vm.runInNewContext(source, sandbox)

  assert.equal(sandbox.window.__tabspace_bridge.protocolVersion, 1)
  assert.equal(typeof sandbox.window.__tabspace_bridge.send, "function")
  assert.equal(typeof sandbox.window.__tabspace_bridge.markReady, "function")
  assert.equal(commands[0].name, "VerifyOnboardingWebsiteAccess")

  sandbox.window.__tabspace_bridge.send("AppendSessions", { bookmarks: [{ uuid: "one" }] })
  assert.equal(commands[1].name, "AppendSessions")
  assert.equal(commands[1].data.bookmarks, '[{"uuid":"one"}]')

  let reply
  sandbox.window.__tabspace_bridge.onMessage = (name, message) => { reply = [name, message] }
  sandbox.document.dispatchEvent(new CustomEvent("tabspace:webextension:message", {
    detail: JSON.stringify({ name: "ReturnDefault", message: { id: "x", value: "3" } })
  }))
  assert.equal(reply[0], "ReturnDefault")
  assert.equal(reply[1].id, "x")
  assert.equal(reply[1].value, "3")
})

test("does not expose the privileged bridge outside the exact production host", () => {
  for (const [host, protocol] of [["evil.example", "https:"], ["app.mytab.space.evil", "https:"], ["app.mytab.space", "http:"]]) {
    const sandbox = context(host, protocol)
    vm.runInNewContext(source, sandbox)
    assert.equal(sandbox.window.__tabspace_bridge, undefined)
  }
})

test("in Safari 17's isolated world it answers the dashboard's App Extension protocol instead", () => {
  const sandbox = context()
  // What Safari 17 gives a `world: "MAIN"` script: the extension APIs.
  sandbox.browser = { runtime: { id: "safari-web-extension-id" } }
  const commands = []
  const replies = []
  const ready = []
  sandbox.document.addEventListener("tabspace:webextension:command", event => commands.push(JSON.parse(event.detail)))
  sandbox.document.addEventListener("tabspace:app-extension:ready", event => ready.push(JSON.parse(event.detail)))
  sandbox.document.addEventListener("tabspace:app-extension:message", event => replies.push(JSON.parse(event.detail)))
  vm.runInNewContext(source, sandbox)

  // Announced on load, and again whenever the dashboard probes.
  assert.deepEqual(ready, [{ protocolVersion: 1 }])
  sandbox.document.dispatchEvent(new CustomEvent("tabspace:app-extension:probe"))
  assert.equal(ready.length, 2)

  // The dashboard's command reaches the extension exactly as the direct bridge sends it.
  sandbox.document.dispatchEvent(new CustomEvent("tabspace:app-extension:command", {
    detail: JSON.stringify({ name: "CheckBookmarks", data: { cmd: "CheckBookmarks", bookmarks: [{ uuid: "one" }] } })
  }))
  const relayed = commands.find(command => command.name === "CheckBookmarks")
  assert.equal(relayed.data.cmd, "CheckBookmarks")
  assert.equal(relayed.data.bookmarks, '[{"uuid":"one"}]')

  // And the reply comes back on the protocol the dashboard is listening to.
  const reply = { name: "ReturnBookmarks", message: { value: "[]" } }
  sandbox.document.dispatchEvent(new CustomEvent("tabspace:webextension:message", { detail: JSON.stringify(reply) }))
  assert.deepEqual(replies, [reply])
})

test("where the page's world is honored it leaves the App Extension protocol alone", () => {
  const sandbox = context()
  const ready = []
  sandbox.document.addEventListener("tabspace:app-extension:ready", event => ready.push(event))
  vm.runInNewContext(source, sandbox)
  sandbox.document.dispatchEvent(new CustomEvent("tabspace:app-extension:probe"))
  assert.equal(ready.length, 0)
})
