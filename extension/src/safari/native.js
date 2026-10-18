(function (root, factory) {
  const exported = factory(root)
  if (typeof module === "object" && module.exports) module.exports = exported
  else root.TabSpaceSafariNative = exported
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict"

  const APPLICATION_ID = "cn.joyuer.Tab-Works"
  const DEFAULT_TIMEOUT_MS = 8_000
  // Safari keeps every native request open until the handler answers it, and
  // macOS terminates Safari once too many are outstanding. A handler that
  // stopped answering therefore must not be sent more: after a request goes
  // unanswered nothing is sent until a cool-down passes, and then one request
  // at a time tests whether the handler answers again. Any answer, even one
  // that arrives after its deadline, ends the cool-down. The state is stored
  // because the background page is reloaded on nearly every wake-up.
  const BACKOFF_STORAGE_KEY = "tabspace-native-backoff"
  const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000]
  const IDLE_BACKOFF = Object.freeze({ until: 0, failures: 0 })

  let backoff = null
  let backoffLoad = null
  let lastAnswerAt = 0

  class NativeMessageError extends Error {
    constructor(code, message, cause) {
      super(message || code)
      this.name = "NativeMessageError"
      this.code = code
      if (cause !== undefined) this.cause = cause
    }
  }

  function normalizeError(error) {
    if (error instanceof NativeMessageError) return error
    const message = error && error.message ? error.message : String(error || "Native messaging failed.")
    return new NativeMessageError("native_transport_failed", message, error)
  }

  function validateMessage(message) {
    const op = message && message.op
    if (typeof op !== "string" || !/^(?:ping|[a-z][a-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)$/.test(op)) {
      throw new NativeMessageError("invalid_native_operation", "Native messages require a namespaced op (or ping).")
    }
  }

  function storageFor(options) {
    if (options.storage) return options.storage
    const storage = root.browser && root.browser.storage
    return storage && storage.local ? storage.local : null
  }

  function loadBackoff(storage) {
    if (backoff) return Promise.resolve(backoff)
    if (!backoffLoad) {
      backoffLoad = Promise.resolve()
        .then(() => storage ? storage.get([BACKOFF_STORAGE_KEY]) : null)
        .then(stored => {
          const value = stored && stored[BACKOFF_STORAGE_KEY]
          return value && Number.isFinite(value.until) && Number.isInteger(value.failures) && value.failures > 0
            ? { until: value.until, failures: value.failures }
            : IDLE_BACKOFF
        }, () => IDLE_BACKOFF)
        .then(value => {
          // A reset made while storage was being read is newer than what it held.
          if (!backoff) backoff = value
          return backoff
        })
    }
    return backoffLoad
  }

  function storeBackoff(storage, value) {
    backoff = value
    if (!storage) return
    try {
      const write = value.failures > 0
        ? storage.set({ [BACKOFF_STORAGE_KEY]: { until: value.until, failures: value.failures } })
        : storage.remove([BACKOFF_STORAGE_KEY])
      if (write && typeof write.catch === "function") write.catch(() => {})
    } catch (_) {}
  }

  // While cooling down nothing is sent. Once the cool-down has passed, the
  // request let through is the one that tests the handler; the window is
  // pushed out by its deadline so that nothing else — not even the next
  // background page — tests it at the same time.
  async function admit(storage, timeoutMs) {
    const state = await loadBackoff(storage)
    if (state.failures === 0) return true
    const now = Date.now()
    if (state.until > now) return false
    storeBackoff(storage, { until: now + Math.min(timeoutMs, DEFAULT_TIMEOUT_MS), failures: state.failures })
    return true
  }

  function answered(storage) {
    lastAnswerAt = Date.now()
    if (backoff && backoff.failures > 0) storeBackoff(storage, IDLE_BACKOFF)
  }

  function unanswered(storage, sentAt) {
    // Another request was answered while this one waited: the handler is
    // alive and this request is merely slow.
    if (lastAnswerAt > sentAt) return
    const state = backoff || IDLE_BACKOFF
    const now = Date.now()
    // Requests sent together time out together; the first one starts the
    // cool-down and the rest change nothing.
    if (state.until > now) return
    const failures = state.failures + 1
    const delay = BACKOFF_STEPS_MS[Math.min(failures, BACKOFF_STEPS_MS.length) - 1]
    storeBackoff(storage, { until: now + delay, failures })
  }

  // A new Safari session or a new extension version starts a new handler.
  function resetBackoff(options = {}) {
    lastAnswerAt = 0
    storeBackoff(storageFor(options), IDLE_BACKOFF)
  }

  function send(message, options = {}) {
    try { validateMessage(message) } catch (error) { return Promise.reject(error) }
    const runtime = options.runtime || (root.browser && root.browser.runtime)
    if (!runtime || typeof runtime.sendNativeMessage !== "function") {
      return Promise.reject(new NativeMessageError("native_unavailable", "Safari native messaging is unavailable."))
    }
    const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs
    const storage = storageFor(options)

    return admit(storage, timeoutMs).then(admitted => {
      if (!admitted) {
        throw new NativeMessageError("native_unresponsive", "Tab Space is not responding. Try again in a minute, or restart Safari.")
      }
      return deliver(runtime, message, timeoutMs, storage)
    })
  }

  function deliver(runtime, message, timeoutMs, storage) {
    const sentAt = Date.now()
    return new Promise((resolve, reject) => {
      let settled = false
      let timer
      const finish = callback => value => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        callback(value)
      }
      const succeed = finish(value => {
        if (value && value.ok === false && value.error) {
          reject(new NativeMessageError(
            value.error.code || "native_error",
            value.error.message || "Tab Space rejected the native operation."
          ))
          return
        }
        resolve(value)
      })
      const fail = finish(error => reject(normalizeError(error)))
      timer = setTimeout(() => {
        unanswered(storage, sentAt)
        fail(new NativeMessageError("native_timeout", `Native operation ${message.op} timed out after ${timeoutMs} ms.`))
      }, timeoutMs)

      try {
        const result = runtime.sendNativeMessage(APPLICATION_ID, message)
        if (result && typeof result.then === "function") {
          // Settling is what releases the request on Safari's side, so a late
          // answer counts too.
          result.then(() => answered(storage), () => answered(storage))
          result.then(succeed, fail)
        } else {
          answered(storage)
          succeed(result)
        }
      } catch (error) {
        fail(error)
      }
    })
  }

  return {
    APPLICATION_ID,
    BACKOFF_STEPS_MS,
    BACKOFF_STORAGE_KEY,
    DEFAULT_TIMEOUT_MS,
    NativeMessageError,
    normalizeError,
    resetBackoff,
    send
  }
})
