const assert = require("node:assert/strict")
const test = require("node:test")
const native = require("../src/safari/native.js")

// A timed-out request pauses native messaging; no test inherits that.
test.beforeEach(() => native.resetBackoff())

function memoryStorage(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial))
  return {
    data,
    get: async keys => Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]])),
    set: async values => { Object.assign(data, JSON.parse(JSON.stringify(values))) },
    remove: async keys => { for (const key of keys) delete data[key] }
  }
}

// The background page is reloaded on most wake-ups; a fresh module is a fresh page.
function freshPage() {
  delete require.cache[require.resolve("../src/safari/native.js")]
  return require("../src/safari/native.js")
}

const silent = { sendNativeMessage: () => new Promise(() => {}) }
const answering = { sendNativeMessage: (id, message) => Promise.resolve({ ok: true, op: message.op }) }
const isTimeout = error => error.code === "native_timeout"
const isPaused = error => error.code === "native_unresponsive"

async function until(condition) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.ok(condition())
}

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

test("an unanswered request pauses native messaging instead of piling up requests", async () => {
  const storage = memoryStorage()
  let sent = 0
  const counting = { sendNativeMessage: () => { sent += 1; return new Promise(() => {}) } }
  await assert.rejects(native.send({ op: "ui.probe" }, { runtime: counting, storage, timeoutMs: 5 }), isTimeout)
  await assert.rejects(native.send({ op: "ui.probe" }, { runtime: counting, storage, timeoutMs: 5 }), isPaused)
  assert.equal(sent, 1)

  const stored = storage.data[native.BACKOFF_STORAGE_KEY]
  assert.equal(stored.failures, 1)
  const wait = stored.until - Date.now()
  assert.ok(wait > native.BACKOFF_STEPS_MS[0] - 1000 && wait <= native.BACKOFF_STEPS_MS[0])
})

test("requests that time out together start one cool-down", async () => {
  const storage = memoryStorage()
  const results = await Promise.allSettled([1, 2, 3].map(() =>
    native.send({ op: "bridge.command" }, { runtime: silent, storage, timeoutMs: 5 })))
  assert.ok(results.every(result => result.status === "rejected" && isTimeout(result.reason)))
  assert.equal(storage.data[native.BACKOFF_STORAGE_KEY].failures, 1)
})

test("a slow request does not pause messaging while others are answered", async () => {
  const storage = memoryStorage()
  const mixed = {
    sendNativeMessage: (id, message) => message.op === "ui.probe" ? new Promise(() => {}) : Promise.resolve({ ok: true })
  }
  const slow = native.send({ op: "ui.probe" }, { runtime: mixed, storage, timeoutMs: 30 })
  await new Promise(resolve => setTimeout(resolve, 5))
  await native.send({ op: "ping" }, { runtime: mixed, storage, timeoutMs: 30 })
  await assert.rejects(slow, isTimeout)
  assert.equal(native.BACKOFF_STORAGE_KEY in storage.data, false)
  assert.deepEqual(await native.send({ op: "ping" }, { runtime: mixed, storage, timeoutMs: 30 }), { ok: true })
})

test("an answer that arrives after its deadline resumes messaging", async () => {
  const storage = memoryStorage()
  let answerLate
  const late = { sendNativeMessage: () => new Promise(resolve => { answerLate = resolve }) }
  await assert.rejects(native.send({ op: "bridge.command" }, { runtime: late, storage, timeoutMs: 5 }), isTimeout)
  await assert.rejects(native.send({ op: "ping" }, { runtime: answering, storage, timeoutMs: 5 }), isPaused)

  answerLate({ ok: true })
  await until(() => !(native.BACKOFF_STORAGE_KEY in storage.data))
  assert.deepEqual(await native.send({ op: "ping" }, { runtime: answering, storage, timeoutMs: 50 }), { ok: true, op: "ping" })
})

test("the pause survives a reload of the background page", async () => {
  const storage = memoryStorage()
  await assert.rejects(native.send({ op: "ui.probe" }, { runtime: silent, storage, timeoutMs: 5 }), isTimeout)

  const page = freshPage()
  let sent = 0
  const counting = { sendNativeMessage: () => { sent += 1; return Promise.resolve({ ok: true }) } }
  await assert.rejects(page.send({ op: "ui.probe" }, { runtime: counting, storage, timeoutMs: 50 }), isPaused)
  assert.equal(sent, 0)

  // A new Safari session clears it.
  page.resetBackoff({ storage })
  assert.equal(native.BACKOFF_STORAGE_KEY in storage.data, false)
  assert.deepEqual(await page.send({ op: "ui.probe" }, { runtime: counting, storage, timeoutMs: 50 }), { ok: true })
  assert.equal(sent, 1)
})

test("after the cool-down one request at a time tests the handler", async () => {
  const pausedSince = { until: Date.now() - 1, failures: 1 }
  const storage = memoryStorage({ [native.BACKOFF_STORAGE_KEY]: pausedSince })
  const page = freshPage()
  let answer
  let sent = 0
  const pending = { sendNativeMessage: () => { sent += 1; return new Promise(resolve => { answer = resolve }) } }

  const first = page.send({ op: "ui.probe" }, { runtime: pending, storage, timeoutMs: 1000 })
  await until(() => answer)
  await assert.rejects(page.send({ op: "ping" }, { runtime: pending, storage, timeoutMs: 1000 }), isPaused)
  assert.equal(sent, 1)

  answer({ available: true })
  assert.deepEqual(await first, { available: true })
  assert.equal(page.BACKOFF_STORAGE_KEY in storage.data, false)
  assert.deepEqual(await page.send({ op: "ping" }, { runtime: answering, storage, timeoutMs: 50 }), { ok: true, op: "ping" })
})

test("each unanswered test waits longer before the next one", async () => {
  const storage = memoryStorage({ [native.BACKOFF_STORAGE_KEY]: { until: Date.now() - 1, failures: 1 } })
  const page = freshPage()
  await assert.rejects(page.send({ op: "ui.probe" }, { runtime: silent, storage, timeoutMs: 5 }), isTimeout)
  const stored = storage.data[page.BACKOFF_STORAGE_KEY]
  assert.equal(stored.failures, 2)
  const wait = stored.until - Date.now()
  assert.ok(wait > page.BACKOFF_STEPS_MS[1] - 1000 && wait <= page.BACKOFF_STEPS_MS[1])
})
