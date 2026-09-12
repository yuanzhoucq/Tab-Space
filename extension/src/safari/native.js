(function (root, factory) {
  const exported = factory(root)
  if (typeof module === "object" && module.exports) module.exports = exported
  else root.TabSpaceSafariNative = exported
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict"

  const APPLICATION_ID = "cn.joyuer.Tab-Works"
  const DEFAULT_TIMEOUT_MS = 8_000

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

  function send(message, options = {}) {
    try { validateMessage(message) } catch (error) { return Promise.reject(error) }
    const runtime = options.runtime || (root.browser && root.browser.runtime)
    if (!runtime || typeof runtime.sendNativeMessage !== "function") {
      return Promise.reject(new NativeMessageError("native_unavailable", "Safari native messaging is unavailable."))
    }
    const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs

    return new Promise((resolve, reject) => {
      let settled = false
      let timer
      const finish = callback => value => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        callback(value)
      }
      const succeed = finish(resolve)
      const fail = finish(error => reject(normalizeError(error)))
      timer = setTimeout(() => {
        fail(new NativeMessageError("native_timeout", `Native operation ${message.op} timed out after ${timeoutMs} ms.`))
      }, timeoutMs)

      try {
        const result = runtime.sendNativeMessage(APPLICATION_ID, message)
        if (result && typeof result.then === "function") result.then(succeed, fail)
        else succeed(result)
      } catch (error) {
        fail(error)
      }
    })
  }

  return { APPLICATION_ID, DEFAULT_TIMEOUT_MS, NativeMessageError, normalizeError, send }
})
