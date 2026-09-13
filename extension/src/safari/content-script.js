(function () {
  "use strict"

  // Runs in the page's MAIN world. No preview, loopback, subdomain or iframe
  // receives this privileged compatibility surface.
  if (window.top !== window || location.protocol !== "https:" || location.host !== "app.mytab.space") return

  const REQUEST_EVENT = "tabspace:webextension:command"
  const MESSAGE_EVENT = "tabspace:webextension:message"
  let onMessage = null
  let payloadDeliveryMs = null

  function send(name, data) {
    const payload = { ...(data || {}) }
    if (payload.bookmarks && typeof payload.bookmarks !== "string") {
      payload.bookmarks = JSON.stringify(payload.bookmarks)
    }
    if (name === "ReportDashboardTiming") {
      if (payloadDeliveryMs !== null) payload.payloadDeliveryMs = payloadDeliveryMs
      payloadDeliveryMs = null
    }
    document.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
      detail: JSON.stringify({ name, data: payload })
    }))
  }

  window.__tabspace_bridge = {
    protocolVersion: 1,
    markReady: () => {},
    send,
    get onMessage() { return onMessage },
    set onMessage(handler) { onMessage = handler }
  }

  document.addEventListener(MESSAGE_EVENT, event => {
    let payload
    try { payload = JSON.parse(event.detail) } catch (_) { return }
    if (!payload || typeof payload.name !== "string") return
    const message = payload.message || {}
    if (typeof message.dispatchedAtMs === "number") {
      payloadDeliveryMs = Math.max(0, Date.now() - message.dispatchedAtMs)
    }
    if (typeof onMessage === "function") onMessage(payload.name, message)
  })

  window.addEventListener("tabspace:dashboard-ready", () => {})
  window.dispatchEvent(new CustomEvent("tabspace:bridge-ready"))
  send("VerifyOnboardingWebsiteAccess", {})
})()
