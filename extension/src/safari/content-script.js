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

  // Safari 17 does not honor `world: "MAIN"`: this script then runs in the
  // extension's isolated world, where the extension APIs are visible and the
  // window.__tabspace_bridge above is not visible to the dashboard, which is
  // left waiting for a library that never arrives. The dashboard also speaks
  // the App Extension's event protocol (tabspace:app-extension:*), and a
  // string detail crosses worlds, so here that protocol is translated onto
  // this one. Where the page's world is honored (Safari 18 and later) the
  // extension APIs are absent and nothing below runs.
  const isolatedWorld = typeof browser !== "undefined" && !!(browser && browser.runtime && browser.runtime.id)
  if (isolatedWorld) {
    const appExtensionEvent = name => `tabspace:app-extension:${name}`
    const announce = () => document.dispatchEvent(new CustomEvent(appExtensionEvent("ready"), {
      detail: JSON.stringify({ protocolVersion: 1 })
    }))
    document.addEventListener(appExtensionEvent("probe"), announce)
    document.addEventListener(appExtensionEvent("command"), event => {
      let request
      try { request = JSON.parse(event.detail) } catch (_) { return }
      if (!request || typeof request.name !== "string") return
      send(request.name, request.data)
    })
    document.addEventListener(MESSAGE_EVENT, event => {
      document.dispatchEvent(new CustomEvent(appExtensionEvent("message"), { detail: event.detail }))
    })
    announce()
  }

  window.addEventListener("tabspace:dashboard-ready", () => {})
  window.dispatchEvent(new CustomEvent("tabspace:bridge-ready"))
  send("VerifyOnboardingWebsiteAccess", {})
})()
