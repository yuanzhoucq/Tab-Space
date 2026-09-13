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
