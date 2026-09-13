(function () {
  "use strict"

  // build.mjs rewrites these two lines for development builds. The suffixes
  // cover Cloudflare Pages preview deployments, which get a new hostname per
  // branch; manifest match patterns cannot express the exact port on Firefox,
  // so this check is the authoritative one.
  const DASHBOARD_ORIGINS = ["https://app.mytab.space"]
  const DASHBOARD_ORIGIN_SUFFIXES = []
  const CHANNEL = "tabspace-webextension-v2"
  const DIRECT_REQUEST_EVENT = "tabspace:webextension:command"
  const DIRECT_MESSAGE_EVENT = "tabspace:webextension:message"

  function isDashboardOrigin(origin) {
    if (typeof origin !== "string" || origin.length === 0) return false
    if (DASHBOARD_ORIGINS.includes(origin)) return true
    if (!origin.startsWith("https://")) return false
    return DASHBOARD_ORIGIN_SUFFIXES.some(suffix =>
      origin === `https://${suffix}` || origin.endsWith(`.${suffix}`))
  }

  if (!isDashboardOrigin(window.location.origin)) return
  const DASHBOARD_ORIGIN = window.location.origin
  const DIRECT_MODE = window.top === window
    && window.location.protocol === "https:"
    && window.location.host === "app.mytab.space"

  const extensionApi = typeof browser !== "undefined" ? browser : chrome
  const preferPromises = typeof browser !== "undefined"
  let nativeConnected = false
  let bridgeInfo = null

  function sendRuntimeMessage(message) {
    if (preferPromises) return extensionApi.runtime.sendMessage(message)
    return new Promise((resolve, reject) => {
      extensionApi.runtime.sendMessage(message, response => {
        const error = extensionApi.runtime.lastError
        if (error) reject(new Error(error.message))
        else resolve(response)
      })
    })
  }

  function post(type, payload = {}) {
    window.postMessage({
      channel: CHANNEL,
      source: "extension",
      type,
      ...payload
    }, DASHBOARD_ORIGIN)
  }

  function postReady() {
    post("ready", { protocolVersion: 2 })
  }

  function postNativeMessage(message) {
    if (DIRECT_MODE) {
      document.dispatchEvent(new CustomEvent(DIRECT_MESSAGE_EVENT, {
        detail: JSON.stringify({ name: message.cmd, message })
      }))
      return
    }
    post("native-message", { message })
  }

  async function forwardDashboardRequest(message, requestId) {
    const response = await sendRuntimeMessage({ type: "dashboard.request", message })
    if (!response || response.ok !== true) {
      const error = response && response.error
        ? response.error
        : { code: "bridge_unavailable", message: "Tab Space is unavailable." }
      if (error.code === "session_limit_reached") {
        postNativeMessage({ cmd: "SessionLimitReached", limit: error.details && error.details.limit })
      }
      if (requestId) post("request-error", { requestId, error })
      return
    }
    const messages = response.result && response.result.messages
    for (const nativeMessage of messages || []) postNativeMessage(nativeMessage)
    if (requestId) post("request-complete", { requestId })
  }

  if (DIRECT_MODE) {
    document.addEventListener(DIRECT_REQUEST_EVENT, event => {
      let command
      try { command = JSON.parse(event.detail) } catch (_) { return }
      if (!command || typeof command.name !== "string") return
      forwardDashboardRequest({ cmd: command.name, ...(command.data || {}) }).catch(() => {})
    })
  }

  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== DASHBOARD_ORIGIN) return
    const data = event.data
    if (!data || data.channel !== CHANNEL || data.source !== "dashboard") return

    if (data.type === "probe") {
      postReady()
      if (nativeConnected) post("connected", { bridgeInfo })
      return
    }
    if (data.type !== "request" || !data.message || !data.requestId) return

    try {
      await forwardDashboardRequest(data.message, data.requestId)
    } catch (error) {
      post("request-error", {
        requestId: data.requestId,
        error: { code: "extension_error", message: error.message }
      })
    }
  })

  const port = extensionApi.runtime.connect({ name: "tabspace-dashboard" })
  port.onMessage.addListener(payload => {
    if (payload && payload.type === "native-message" && payload.message) {
      postNativeMessage(payload.message)
    }
    if (payload && payload.type === "bridge-connected") {
      nativeConnected = true
      bridgeInfo = payload.result || bridgeInfo
      post("connected", { bridgeInfo })
    }
  })

  extensionApi.runtime.onMessage.addListener(payload => {
    if (payload && payload.type === "dashboard.nativeMessage" && payload.message) {
      postNativeMessage(payload.message)
    }
  })

  sendRuntimeMessage({ type: "dashboard.connect" }).then(response => {
    if (!response || response.ok !== true) {
      post("connection-error", { error: response && response.error })
    } else {
      nativeConnected = true
      bridgeInfo = response.result || null
      post("connected", { bridgeInfo })
    }
  }).catch(error => {
    post("connection-error", { error: { code: "extension_error", message: error.message } })
  })

  postReady()
})()
