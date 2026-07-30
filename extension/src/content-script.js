(function () {
  "use strict"

  // build.mjs rewrites these two lines for development builds. The suffixes
  // cover Cloudflare Pages preview deployments, which get a new hostname per
  // branch; manifest match patterns cannot express the exact port on Firefox,
  // so this check is the authoritative one.
  const DASHBOARD_ORIGINS = ["https://app.mytab.space"]
  const DASHBOARD_ORIGIN_SUFFIXES = []
  const CHANNEL = "tabspace-webextension-v2"

  function isDashboardOrigin(origin) {
    if (typeof origin !== "string" || origin.length === 0) return false
    if (DASHBOARD_ORIGINS.includes(origin)) return true
    if (!origin.startsWith("https://")) return false
    return DASHBOARD_ORIGIN_SUFFIXES.some(suffix =>
      origin === `https://${suffix}` || origin.endsWith(`.${suffix}`))
  }

  if (!isDashboardOrigin(window.location.origin)) return
  const DASHBOARD_ORIGIN = window.location.origin

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
    post("native-message", { message })
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
      const response = await sendRuntimeMessage({ type: "dashboard.request", message: data.message })
      if (!response || response.ok !== true) {
        post("request-error", {
          requestId: data.requestId,
          error: response && response.error ? response.error : { code: "bridge_unavailable", message: "Tab Space is unavailable." }
        })
        return
      }
      const messages = response.result && response.result.messages
      for (const message of messages || []) postNativeMessage(message)
      post("request-complete", { requestId: data.requestId })
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
