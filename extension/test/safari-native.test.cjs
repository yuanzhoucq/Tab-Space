const assert = require("node:assert/strict")
const test = require("node:test")
const native = require("../src/safari/native.js")

test("sends a namespaced operation to the containing app", async () => {
  const calls = []
  const reply = await native.send({ op: "bridge.pairingCode" }, {
    runtime: { sendNativeMessage: (...args) => { calls.push(args); return Promise.resolve({ code: "123456" }) } },
    timeoutMs: 50
  })
  assert.deepEqual(calls, [[native.APPLICATION_ID, { op: "bridge.pairingCode" }]])
  assert.deepEqual(reply, { code: "123456" })
})

test("normalizes transport failures", async () => {
  await assert.rejects(native.send({ op: "ui.probe" }, {
    runtime: { sendNativeMessage: () => Promise.reject(new Error("host unavailable")) },
    timeoutMs: 50
  }), error => error.code === "native_transport_failed" && error.message === "host unavailable")
})

test("normalizes application errors returned by the containing app", async () => {
  await assert.rejects(native.send({ op: "bridge.pairingCode" }, {
    runtime: { sendNativeMessage: () => Promise.resolve({
      ok: false,
      error: { code: "pairing_code_unavailable", message: "Open Tab Space." }
    }) },
    timeoutMs: 50
  }), error => error.code === "pairing_code_unavailable" && error.message === "Open Tab Space.")
})

test("times out native operations after the configured deadline", async () => {
  await assert.rejects(native.send({ op: "ping" }, {
    runtime: { sendNativeMessage: () => new Promise(() => {}) },
    timeoutMs: 5
  }), error => error.code === "native_timeout")
})

test("rejects operations outside the native namespace", async () => {
  await assert.rejects(native.send({ op: "menu" }), error => error.code === "invalid_native_operation")
})
