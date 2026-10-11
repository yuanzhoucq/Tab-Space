(function (root, factory) {
  const exported = factory(root)
  if (typeof module === "object" && module.exports) {
    module.exports = exported
  } else {
    exported.install()
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict"

  // build.mjs rewrites this literal for the Safari package. Keeping the source
  // value companion-safe prevents Chrome, Edge, and Firefox from loading any
  // Safari-only API surface.
  const BUILD_TARGET = "companion"

  const PROTOCOL_VERSION = 2
  const INITIAL_PORT = 53791
  const PORT_STEP = 17
  const PORT_ATTEMPTS = 10
  const SWITCHER_CAPABILITY = "switcher.tabs.v1"
  // Advertised separately from listing so an app build that predates
  // save-and-close still gets tabs from this extension, and a newer app knows
  // not to ask an older extension to close anything it cannot.
  const SWITCHER_CLOSE_CAPABILITY = "switcher.tabs.close.v1"
  const RECONNECT_ALARM_NAME = "tabspace-bridge-reconnect"
  const KEEPALIVE_STORAGE_KEY = "tabspace-bridge-heartbeat"
  // build.mjs rewrites these two lines for development builds. The first entry
  // is the origin the extension opens; the suffixes cover Cloudflare Pages
  // preview deployments, which get a new hostname per branch.
  const DASHBOARD_ORIGINS = ["https://app.mytab.space"]
  const DASHBOARD_ORIGIN_SUFFIXES = []
  const DASHBOARD_ORIGIN = DASHBOARD_ORIGINS[0]
  const STORAGE_KEYS = {
    clientId: "tabspace-client-id",
    authToken: "tabspace-auth-token",
    bridgePort: "tabspace-bridge-port"
  }

  async function verifySafariNativeRoundTrip() {
    if (BUILD_TARGET !== "safari") return
    try {
      const reply = await root.TabSpaceSafariNative.send({ op: "ping" })
      console.info("[tabspace] Safari native ping", reply)
    } catch (error) {
      console.error("[tabspace] Safari native ping failed", error)
    }
  }

  class BridgeError extends Error {
    constructor(code, message, details) {
      super(message || code)
      this.name = "BridgeError"
      this.code = code
      this.details = details
    }
  }

  function isDashboardOrigin(origin) {
    if (typeof origin !== "string" || origin.length === 0) return false
    if (DASHBOARD_ORIGINS.includes(origin)) return true
    if (!origin.startsWith("https://")) return false
    return DASHBOARD_ORIGIN_SUFFIXES.some(suffix =>
      origin === `https://${suffix}` || origin.endsWith(`.${suffix}`))
  }

  function isDashboardUrl(rawUrl) {
    if (typeof rawUrl !== "string" || rawUrl.length === 0) return false
    try {
      return isDashboardOrigin(new URL(rawUrl).origin)
    } catch (_) {
      return false
    }
  }

  // Background lookups ask tabs.query for dashboard tabs only. Safari treats
  // reading another site's tab URL as a request for access to that site, so
  // scanning every tab on each connection badged the toolbar button and turned
  // the next click into a permission prompt for whatever page was open. Ports
  // are left out of the patterns (Firefox rejects them, and a pattern without
  // one matches any port); isDashboardUrl still has the final say.
  function dashboardTabPatterns() {
    const patterns = []
    for (const origin of DASHBOARD_ORIGINS) {
      try {
        const url = new URL(origin)
        patterns.push(`${url.protocol}//${url.hostname}/*`)
      } catch (_) {}
    }
    for (const suffix of DASHBOARD_ORIGIN_SUFFIXES) {
      patterns.push(`https://${suffix}/*`, `https://*.${suffix}/*`)
    }
    return patterns
  }

  async function queryDashboardTabs(browserApi) {
    const tabs = await browserApi.queryTabs({ url: dashboardTabPatterns() })
    return (tabs || []).filter(tab => isDashboardUrl(tab.url))
  }

  // The port that answered last time is tried first. That is an ordering hint
  // and nothing more: any unrelated process can take a loopback port at any
  // moment, so the full sweep stays the authoritative way to find the helper.
  function portCandidates(preferredPort) {
    const ports = Array.from({ length: PORT_ATTEMPTS }, (_, index) => INITIAL_PORT + PORT_STEP * index)
    if (!ports.includes(preferredPort)) return ports
    return [preferredPort, ...ports.filter(port => port !== preferredPort)]
  }

  // Codes that describe the connection rather than an answer from a helper.
  // Reaching one of these means nothing was listening, or nothing replied.
  const TRANSPORT_ERROR_CODES = [
    "connection_failed",
    "connection_timeout",
    "connection_closed",
    "request_timeout",
    "not_connected"
  ]

  function isTransportError(error) {
    return Boolean(error) && TRANSPORT_ERROR_CODES.includes(error.code)
  }

  // The refusals an approval prompt can actually resolve. A helper that already
  // recognizes this browser and refuses it on entitlement is deliberately left
  // out: no one approving a prompt can turn that into access, and asking would
  // offer an upgrade as if it were a connection problem.
  const APPROVABLE_ERROR_CODES = ["pairing_required", "authentication_failed"]

  // Which refusal to report when several helpers answered.
  //
  // A Mac with more than one logged-in account runs one helper per account, and
  // loopback ports are machine-wide, so this browser hears from all of them.
  // The answer worth showing is the most specific one: an entitlement or code
  // problem is actionable, "this browser is unknown" is the normal first-run
  // state, and a transport failure says only that nobody was there.
  const BRIDGE_ERROR_RANK = [
    "connection_failed",
    "connection_timeout",
    "connection_closed",
    "not_connected",
    "request_timeout",
    "pairing_required",
    "pairing_not_visible",
    "pairing_timeout",
    "pairing_declined",
    "authentication_failed",
    "credential_store_failed",
    "pairing_rate_limited",
    "invalid_pairing_code",
    "pro_required"
  ]

  // An unexpected code still came from a helper, so it outranks the states that
  // merely describe a first run, but it loses to the answers above that name
  // something the person can act on.
  const UNRANKED_BRIDGE_ERROR = BRIDGE_ERROR_RANK.indexOf("authentication_failed")

  function preferredBridgeError(current, next) {
    if (!next) return current || null
    if (!current) return next
    const rank = error => {
      const index = BRIDGE_ERROR_RANK.indexOf(error && error.code)
      return index === -1 ? UNRANKED_BRIDGE_ERROR : index
    }
    return rank(next) >= rank(current) ? next : current
  }

  function randomId(prefix) {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return `${prefix}-${root.crypto.randomUUID()}`
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function browserFamily(userAgent = "") {
    if (/Firefox\//i.test(userAgent)) return "firefox"
    if (/Edg\//i.test(userAgent)) return "edge"
    if (/Chrome\//i.test(userAgent)) return "chrome"
    return "unknown"
  }

  function isSavableUrl(rawUrl) {
    if (typeof rawUrl !== "string" || rawUrl.length === 0) return false
    let url
    try {
      url = new URL(rawUrl)
    } catch (_) {
      return false
    }
    if (isDashboardOrigin(url.origin)) return false
    return ["http:", "https:", "file:", "ftp:"].includes(url.protocol)
  }

  function isSavableTab(tab) {
    return Boolean(tab && Number.isInteger(tab.id) && isSavableUrl(tab.url))
  }

  function normalizeTabs(tabs, options = {}) {
    const ignorePinned = Boolean(options.ignorePinned)
    const ignoreDuplicates = Boolean(options.ignoreDuplicates)
    const seenUrls = new Set()
    return (tabs || []).filter(tab => {
      if (!isSavableTab(tab)) return false
      if (ignorePinned && tab.pinned) return false
      if (ignoreDuplicates && seenUrls.has(tab.url)) return false
      seenUrls.add(tab.url)
      return true
    }).map(tab => ({
      id: tab.id,
      windowId: tab.windowId,
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned),
      title: tab.title || tab.url,
      url: tab.url
    }))
  }

  function popupSessionOptions(sessions) {
    return (sessions || []).filter(session => {
      if (!session || typeof session.uuid !== "string" || session.uuid.length === 0) return false
      return !(session.tags || []).some(tag => tag && tag.name === "@Trash")
    }).map(session => ({
      uuid: session.uuid,
      title: typeof session.title === "string" ? session.title : "",
      timestamp: Number(session.timestamp) || 0,
      siteCount: Array.isArray(session.sites) ? session.sites.length : 0
    }))
  }

  function dashboardCapabilities(nativeCapabilities) {
    const capabilities = Array.isArray(nativeCapabilities) ? [...nativeCapabilities] : []
    // This marker belongs to the WebExtension adapter, not the native helper.
    // Requiring it keeps a newly updated app from exposing AI through an older
    // extension release that forwards `ai.v1` but cannot map its commands.
    if (capabilities.includes("ai.v1") && !capabilities.includes("dashboard.ai.v1")) {
      capabilities.push("dashboard.ai.v1")
    }
    return capabilities
  }

  function parseBookmarks(bookmarks) {
    if (typeof bookmarks !== "string") return bookmarks || []
    try {
      return JSON.parse(bookmarks)
    } catch (_) {
      throw new BridgeError("invalid_bookmarks", "The dashboard sent invalid session data.")
    }
  }

  function dashboardCommandToOperation(message) {
    const msg = message || {}
    switch (msg.cmd) {
      case "VerifyOnboardingWebsiteAccess":
        return { kind: "native", method: "onboarding.websiteAccessVerified", params: {} }
      case "DuplicateTab":
      case "SaveTabs":
      case "SaveCurrentTab":
      case "OpenInExternalBrowser1":
      case "OpenInExternalBrowser2":
      case "CloseRightTabs":
      case "CloseLeftTabs":
      case "CloseSameDomainTabs":
      case "CloseOtherTabs":
      case "AddToNotes":
        return { kind: "browser-command", method: msg.cmd, params: msg }
      case "RedirectToSpace":
      case "GoToSpace":
        return { kind: "browser", method: "dashboard.open", params: {} }
      case "CheckBookmarks":
        // `origin` lets the app hand back an upgrade prompt a toolbar save
        // earned: only a dashboard can show one, and taking it consumes it.
        return { kind: "native", method: "sessions.list", params: { origin: "dashboard" } }
      case "AppendSessions":
        // `origin` tells the app this save came from the dashboard rather than
        // the toolbar; its analytics label the two differently for Safari.
        return { kind: "native", method: "sessions.append", params: { sessions: parseBookmarks(msg.bookmarks), origin: "dashboard" } }
      case "UpdateSession":
        return { kind: "native", method: "sessions.update", params: { sessions: parseBookmarks(msg.bookmarks), ...(["enhance", "orphan_tags"].includes(msg.aiApplied) ? { aiApplied: msg.aiApplied } : {}) } }
      case "DeleteSession":
        return { kind: "native", method: "sessions.delete", params: { sessions: parseBookmarks(msg.bookmarks) } }
      case "MergeSessions":
        return {
          kind: "native",
          method: "sessions.merge",
          params: {
            sessions: parseBookmarks(msg.bookmarks),
            deduplicateSites: msg.deduplicateSites === true, aiApplied: msg.aiApplied === true
          }
        }
      case "UpSession":
        return { kind: "native", method: "sessions.up", params: { sessions: parseBookmarks(msg.bookmarks) } }
      case "SwapSession":
        return { kind: "native", method: "sessions.swap", params: { uuids: msg.uuids || [] } }
      case "MoveSession":
        return { kind: "native", method: "sessions.move", params: { uuids: msg.uuids || [] } }
      case "CheckDefault":
        if (msg.name === "tabspace-native-protocol-version") {
          return { kind: "local", method: "settings.get", params: {}, result: { name: msg.name, value: "3" } }
        }
        return { kind: "native", method: "settings.get", params: { name: msg.name } }
      case "SetDefault":
        return { kind: "native", method: "settings.set", params: { name: msg.name, value: msg.value } }
      case "CheckSwitcherHelperStatus":
        return { kind: "native", method: "sync.status", params: {}, response: "helper" }
      case "CheckSyncStatus":
        return { kind: "native", method: "sync.status", params: {}, response: "sync" }
      case "OpenTabSpaceApp":
        return { kind: "native", method: "app.open", params: {} }
      case "ReportDashboardTiming":
        return {
          kind: "native",
          method: "diagnostics.dashboardTiming",
          params: {
            ...(msg.payloadDeliveryMs !== undefined ? { payloadDeliveryMs: msg.payloadDeliveryMs } : {}),
            ...(msg.dashboardRenderMs !== undefined ? { dashboardRenderMs: msg.dashboardRenderMs } : {})
          }
        }
      case "ListBackups":
        return { kind: "native", method: "backups.list", params: {} }
      case "ForceBackup":
        return { kind: "native", method: "backups.create", params: {} }
      case "RestoreBackup":
        return { kind: "native", method: "backups.restore", params: { filename: msg.filename } }
      case "PrepareAI":
        return { kind: "native", method: "ai.prepare", params: {} }
      case "EnhanceSession": {
        const session = parseBookmarks(msg.bookmarks)[0] || {}
        return {
          kind: "native",
          method: "ai.enhance",
          params: {
            uuid: msg.uuid || session.uuid || "",
            sites: session.sites || []
          }
        }
      }
      case "ClusterTabs": {
        const session = parseBookmarks(msg.bookmarks)[0] || {}
        return {
          kind: "native",
          method: "ai.cluster",
          params: {
            uuid: msg.uuid || session.uuid || "",
            sites: session.sites || []
          }
        }
      }
      case "SaveSplitSessions":
        return {
          kind: "native",
          method: "sessions.saveSplit",
          params: {
            clusters: parseBookmarks(msg.clusters),
            originalUuid: msg.originalUuid || "",
            origin: "dashboard"
          }
        }
      case "GetSuggestions":
        return { kind: "native", method: "suggestions.list", params: {} }
      case "DismissSuggestion":
        return {
          kind: "native",
          method: "suggestions.dismiss",
          params: {
            id: msg.id || "",
            muteType: msg.muteType === true,
            type: msg.type || ""
          }
        }
      case "CheckSubscriptionStatus":
        return { kind: "native", method: "subscription.status", params: {} }
      case "PurchaseSubscription":
        return {
          kind: "native",
          method: "subscription.purchase",
          params: { ...(typeof msg.productId === "string" ? { productId: msg.productId } : {}),
            ...(["ai_quota", "ai_action", "dashboard_session_limit"].includes(msg.source) ? { source: msg.source } : {}) }
        }
      case "RestorePurchases":
        return { kind: "native", method: "subscription.restore", params: {} }
      case "RestoreSession":
        return { kind: "browser", method: "tabs.restore", params: { sessions: parseBookmarks(msg.bookmarks) } }
      case "CheckDevBridge":
        return { kind: "local", method: "dev.bridge", params: {}, result: {} }
      default:
        throw new BridgeError("unsupported_command", `Unsupported dashboard command: ${msg.cmd || "(missing)"}`)
    }
  }

  // ReturnSplitSaved, as the Safari App Extension sends it: `ok`, or the local
  // bridge's error code (session_limit_reached, nothing_to_save, save_failed).
  function splitSavedMessage(operation, error) {
    const message = {
      cmd: "ReturnSplitSaved",
      originalUuid: (operation.params && operation.params.originalUuid) || "",
      ok: !error
    }
    if (error) {
      message.error = error.code || "save_failed"
      if (error.details && error.details.limit !== undefined) message.limit = error.details.limit
    }
    return message
  }

  function dashboardMessagesFor(operation, result) {
    if (operation.method === "dev.bridge") return [{ cmd: "DevBridgeAllowed" }]
    if (operation.response === "helper") {
      return [{ cmd: "ReturnSwitcherHelperStatus", status: result && result.helperRunning ? "ready" : "needsAppLaunch" }]
    }
    if (operation.response === "sync") return [{ cmd: "ReturnSyncStatus", ...(result || {}) }]
    if (operation.kind === "browser" || operation.kind === "browser-command") return []
    if (operation.method.startsWith("sessions.") || operation.method === "backups.restore") {
      const messages = []
      if (Array.isArray(result && result.sessions)) {
        messages.push({
          cmd: "ReturnBookmarks",
          bookmarks: result.sessions,
          value: JSON.stringify(result.sessions),
          source: "local-bridge",
          dispatchedAtMs: Date.now()
        })
      }
      // The upgrade prompt this save earned, or one a toolbar save left
      // queued. It follows the library so the modal opens over the session the
      // user just saved. Named by the app; the dashboard has switched on
      // SessionUpgradeSuggested / SessionQuotaExhausted since the App
      // Extension sent them.
      const milestone = result && result.milestone
      if (milestone && typeof milestone.message === "string") {
        messages.push({ cmd: milestone.message, limit: milestone.limit })
      }
      // The split preview waits for this acknowledgement; it follows the
      // bookmarks so the new sessions are on screen when the preview closes.
      if (operation.method === "sessions.saveSplit") messages.push(splitSavedMessage(operation))
      return messages
    }
    if (operation.method === "settings.get" || operation.method === "settings.set") {
      return [{ cmd: "ReturnDefault", id: result.name, value: result.value }]
    }
    if (operation.method === "backups.list") {
      return [{ cmd: "ReturnBackups", backups: JSON.stringify(result.backups || []) }]
    }
    if (operation.method === "backups.create") {
      return [{ cmd: "BackupComplete" }]
    }
    if (operation.method === "ai.enhance") {
      return [{
        cmd: "ReturnEnhancedSession",
        ...result,
        ...(result && result.tags !== undefined
          ? { tags: typeof result.tags === "string" ? result.tags : JSON.stringify(result.tags) }
          : {})
      }]
    }
    if (operation.method === "ai.cluster") {
      return [{
        cmd: "ReturnSplitPreview",
        ...result,
        ...(result && result.clusters !== undefined
          ? { clusters: typeof result.clusters === "string" ? result.clusters : JSON.stringify(result.clusters) }
          : {})
      }]
    }
    if (operation.method === "suggestions.list") {
      return [{
        cmd: "ReturnSuggestions",
        suggestions: JSON.stringify((result && result.suggestions) || [])
      }]
    }
    if (operation.method === "subscription.status"
      || operation.method === "subscription.restore") {
      return [{ cmd: "ReturnSubscriptionStatus", ...(result || {}) }]
    }
    if (operation.method === "subscription.purchase") {
      return [{ cmd: "PurchaseResult", ...(result || {}) }]
    }
    return []
  }

  function dashboardMessageForEvent(event) {
    if (!event || typeof event.event !== "string") return null
    if (event.event === "sessions.changed") {
      return { cmd: "SessionsChangedRemotely", revision: event.revision }
    }
    return null
  }

  async function sendDashboardEvent(browserApi, event) {
    const message = dashboardMessageForEvent(event)
    if (!message) return { sent: 0 }
    const dashboards = await queryDashboardTabs(browserApi)
    await Promise.all(dashboards.map(tab =>
      browserApi.sendTabMessage(tab.id, { type: "dashboard.nativeMessage", message }).catch(() => {})))
    return { sent: dashboards.length }
  }

  // A saved session reaches an open dashboard two ways: the helper broadcasts
  // `sessions.changed` to every socket, and the extension that made the save
  // reports it itself right after the acknowledgement. The second path exists
  // because the first is not reliable from the saving extension's own side:
  // Safari suspends the background context as soon as the toolbar action's
  // promise settles, and the helper sends the request's result before the
  // broadcast, so the event arrived after the context was gone — the
  // dashboard only showed the new session after a manual reload. It also
  // covers Safari's native-messaging fallback, which has no socket to be
  // broadcast on at all. The revision tells the two reports of one change
  // apart, so a dashboard is asked to refresh once, not twice.
  function createDashboardChangeNotifier(browserApi) {
    let lastRevision = null
    return async function notify(revision) {
      const known = Number.isFinite(revision) && revision > 0
      if (known && revision === lastRevision) return { sent: 0, duplicate: true }
      if (known) lastRevision = revision
      return sendDashboardEvent(browserApi, { event: "sessions.changed", revision })
    }
  }

  // How the Safari extension pairs: it asks its own app over native messaging,
  // a channel no other extension can reach. A token issued there pairs Safari
  // without touching the one-time code, which a person may be copying for
  // another browser at that very moment. An app that predates the operation
  // refuses it, and the code is read instead.
  async function safariBridgeCredential(native, clientId) {
    if (!native || typeof native.send !== "function") {
      throw new BridgeError("native_unavailable", "Tab Space native messaging is unavailable.")
    }
    try {
      const issued = await native.send({ op: "bridge.credential", clientId })
      if (issued && typeof issued.token === "string" && issued.token.length > 0) {
        return { token: issued.token }
      }
    } catch (error) {
      if (!error || error.code !== "unsupported_operation") throw error
    }
    const response = await native.send({ op: "bridge.pairingCode" })
    return response && response.code
  }

  function createBrowserApi(extensionApi, preferPromises) {
    function callbackCall(target, method, args) {
      return new Promise((resolve, reject) => {
        target[method](...args, result => {
          const runtimeError = extensionApi.runtime && extensionApi.runtime.lastError
          if (runtimeError) reject(new BridgeError("browser_api_error", runtimeError.message))
          else resolve(result)
        })
      })
    }

    function call(target, method, ...args) {
      if (preferPromises) return Promise.resolve(target[method](...args))
      return callbackCall(target, method, args)
    }

    return {
      queryTabs(query) { return call(extensionApi.tabs, "query", query) },
      createTab(properties) { return call(extensionApi.tabs, "create", properties) },
      updateTab(id, properties) { return call(extensionApi.tabs, "update", id, properties) },
      updateWindow(id, properties) { return call(extensionApi.windows, "update", id, properties) },
      removeTabs(ids) { return call(extensionApi.tabs, "remove", ids) },
      sendTabMessage(id, message) { return call(extensionApi.tabs, "sendMessage", id, message) },
      getStorage(keys) { return call(extensionApi.storage.local, "get", keys) },
      setStorage(values) { return call(extensionApi.storage.local, "set", values) },
      removeStorage(keys) { return call(extensionApi.storage.local, "remove", keys) },
      // Deliberately a write to session storage rather than a no-op: the write
      // fires storage.onChanged, and a dispatched WebExtension event is what
      // resets Firefox's background idle timer. See the keepalive handler.
      touchSessionStorage(value) {
        const session = extensionApi.storage && extensionApi.storage.session
        if (!session) return Promise.resolve()
        return call(session, "set", { [KEEPALIVE_STORAGE_KEY]: value })
      },
      manifest() { return extensionApi.runtime.getManifest() },
      dashboardUrl() { return `${DASHBOARD_ORIGIN}/` },
      raw: extensionApi
    }
  }

  class LocalBridgeClient {
    constructor(options) {
      this.WebSocket = options.WebSocket
      this.alarmApi = options.alarmApi || null
      this.storage = options.storage
      this.client = options.client
      this.connectTimeout = options.connectTimeout || 650
      this.requestTimeout = options.requestTimeout || 10000
      this.aiRequestTimeout = options.aiRequestTimeout || 90000
      this.pairingRequestTimeout = options.pairingRequestTimeout || 120000
      this.reconnectDelays = options.reconnectDelays || [500, 1000, 2000, 4000, 8000, 15000]
      this.socket = null
      this.handshake = null
      this.pending = new Map()
      this.connectPromise = null
      // What the in-flight attempt is allowed to do: "plain", "approval" (may
      // ask the Mac app to approve this browser) or "code" (carries a pairing
      // code). Callers only share an attempt that can do what they need.
      this.connectKind = null
      this.approvalAborted = false
      this.awaitingApproval = false
      this.approvalAnnounceDelay = options.approvalAnnounceDelay === undefined
        ? 350
        : options.approvalAnnounceDelay
      this.listeners = new Set()
      this.reconnectTimer = null
      this.reconnectAttempts = 0
      this.reconnectAlarmArmed = false
      this.pairingCodeProvider = options.pairingCodeProvider || null
      // Fired on every successful handshake, not only after the user typed a
      // pairing code: a dashboard left open while the app was started has no
      // other way to learn that the bridge came up.
      this.onConnected = options.onConnected || null
      this.onAwaitingApproval = options.onAwaitingApproval || null
    }

    addEventListener(listener) {
      this.listeners.add(listener)
      return () => this.listeners.delete(listener)
    }

    async identity() {
      const values = await this.storage.get([
        STORAGE_KEYS.clientId,
        STORAGE_KEYS.authToken,
        STORAGE_KEYS.bridgePort
      ])
      let clientId = values[STORAGE_KEYS.clientId]
      if (!clientId) {
        clientId = randomId("browser")
        await this.storage.set({ [STORAGE_KEYS.clientId]: clientId })
      }
      return {
        clientId,
        authToken: values[STORAGE_KEYS.authToken] || "",
        port: Number(values[STORAGE_KEYS.bridgePort]) || 0
      }
    }

    // Whether this browser has ever been paired. A background wake-up with no
    // credential has nothing to authenticate with, so it stays silent instead
    // of knocking on every helper on the machine once a minute.
    async hasCredential() {
      const values = await this.storage.get([STORAGE_KEYS.authToken])
      const token = values[STORAGE_KEYS.authToken]
      return typeof token === "string" && token.length > 0
    }

    // `trigger` separates a connect the person asked for from a background
    // wake-up, and only the first may ask a Mac session to approve this
    // browser. An unattended reconnect that could be approved would be
    // approved by whoever happens to be at the machine, which on a shared Mac
    // is not necessarily this browser's owner.
    async connect(options = {}) {
      const kind = options.pairingCode
        ? "code"
        : (options.requestApproval === true ? "approval" : "plain")
      this.cancelReconnect()
      for (;;) {
        if (this.isAuthenticated()) return this.handshake
        if (!this.connectPromise) break
        const running = this.connectKind
        // An attempt is shared only when it can do what this caller needs.
        // Anything can wait on an attempt that may pair; a plain attempt can
        // not answer a caller who brought a code or wants approval — that is
        // how a code the user had just typed came back as "pairing required".
        if (kind === "plain" || kind === running || (kind === "approval" && running === "code")) {
          // A popup opened while the app is already asking has to show the
          // wait it joined, not "Loading" for the next two minutes.
          if (kind === "approval" && this.awaitingApproval) this.announceAwaitingApproval()
          return this.connectPromise
        }
        // A typed code is the person choosing the fallback; the prompt they
        // did not see is abandoned rather than raised on the next helper.
        if (kind === "code" && running === "approval") this.abortApproval()
        try { await this.connectPromise } catch (_) {}
      }
      this.connectKind = kind
      this.approvalAborted = false
      this.connectPromise = this.connectWithAutomaticPairing(options).finally(() => {
        this.connectPromise = null
        this.connectKind = null
      })
      return this.connectPromise
    }

    // An open socket is not a connection: during the sweep and while the app is
    // asking for approval the socket is open but unauthenticated, and treating
    // it as connected handed a second popup an empty handshake.
    isAuthenticated() {
      return Boolean(this.socket && this.socket.readyState === 1 && this.handshake)
    }

    abortApproval() {
      if (this.connectKind !== "approval") return
      this.approvalAborted = true
      // Interrupts the request the helper is holding open for its prompt.
      this.close()
    }

    announceAwaitingApproval() {
      this.awaitingApproval = true
      if (!this.onAwaitingApproval) return
      try { this.onAwaitingApproval({ browser: this.client && this.client.browser }) } catch (_) {}
    }

    async connectWithAutomaticPairing(options) {
      try {
        // A browser with its own pairing channel never raises a prompt: the
        // Safari extension is paired by the app over native messaging, without
        // asking anyone.
        return await this.connectAcrossPorts(this.pairingCodeProvider
          ? { ...options, requestApproval: false }
          : options)
      } catch (error) {
        if (options.pairingCode || !this.pairingCodeProvider
          || !error || error.code !== "pairing_required") {
          throw error
        }
        // The provider answers with a token the app issued directly, or — from
        // an app that predates that — the six-digit code to pair with.
        const credential = await this.pairingCodeProvider()
        this.close()
        if (credential && typeof credential === "object" && typeof credential.token === "string"
          && credential.token.length > 0) {
          await this.storage.set({ [STORAGE_KEYS.authToken]: credential.token })
          return this.connectAcrossPorts(options)
        }
        const code = credential && typeof credential === "object" ? credential.code : credential
        if (!/^\d{6}$/.test(String(code || ""))) {
          throw new BridgeError("invalid_pairing_code", "Tab Space did not provide a valid pairing code.")
        }
        return this.connectAcrossPorts({ ...options, pairingCode: String(code) })
      }
    }

    // Every port is tried, even after a helper has answered.
    //
    // Each logged-in account runs its own helper and loopback ports are
    // machine-wide, so the first helper to answer is often another account's,
    // which does not know this browser. Stopping at that refusal is what left
    // an already-paired browser permanently unable to find its own helper.
    async connectAcrossPorts(options = {}) {
      const identity = await this.identity()
      const pairingCode = options.pairingCode || ""
      const helperPorts = []
      let bestError = null

      for (const port of portCandidates(identity.port)) {
        let result
        try {
          const socket = await this.openSocket(port)
          this.attachSocket(socket)
          result = await this.requestOnOpenSocket("hello", {
            clientId: identity.clientId,
            // An explicit code means the user is deliberately pairing this
            // browser again, so the stored token is left out: with it present
            // the helper would authenticate and never consume the code.
            token: pairingCode ? "" : identity.authToken,
            pairingCode,
            trigger: options.trigger || "background",
            ...this.client
          })
        } catch (error) {
          this.close()
          // The client identifier travels unchanged to every helper, so a
          // helper rejecting it is the one answer no other helper can improve.
          if (error && error.code === "invalid_client") throw error
          if (error && APPROVABLE_ERROR_CODES.includes(error.code)) helperPorts.push(port)
          bestError = preferredBridgeError(bestError, error)
          continue
        }
        if (!result || result.authenticated !== true) {
          this.close()
          helperPorts.push(port)
          bestError = preferredBridgeError(bestError, new BridgeError(
            "authentication_failed", "Tab Space rejected the browser connection."))
          continue
        }
        return this.adoptHandshake(result, port)
      }

      if (options.requestApproval === true && !pairingCode && helperPorts.length > 0) {
        const approval = await this.requestApprovalAcrossPorts(identity, helperPorts)
        if (approval.handshake) return approval.handshake
        if (approval.superseded) throw approval.error
        bestError = preferredBridgeError(bestError, approval.error)
      }

      if (!bestError || isTransportError(bestError)) {
        throw new BridgeError("helper_unavailable", "Open Tab Space once to enable its browser helper.")
      }
      throw bestError
    }

    // Ask the Mac app to approve this browser, instead of asking the person to
    // carry a six-digit code between the two.
    //
    // The request goes to every helper that answered, in port order, because
    // the helper belonging to the person at the keyboard is not necessarily
    // the first one found. A helper whose session is not on screen is expected
    // to refuse immediately rather than raise a prompt nobody can see, which
    // is what keeps this from stalling on a backgrounded account.
    async requestApprovalAcrossPorts(identity, ports) {
      const superseded = () => ({
        superseded: true,
        error: new BridgeError("pairing_superseded", "A pairing code replaced the approval request.")
      })
      let bestError = null
      // Announced only once a request has been pending for a moment. An app
      // that predates approval refuses at once, and announcing straight away
      // flashed a "waiting for your Mac" state that was never going to resolve.
      const announce = this.approvalAnnounceDelay > 0
        ? setTimeout(() => this.announceAwaitingApproval(), this.approvalAnnounceDelay)
        : null
      if (!announce) this.announceAwaitingApproval()
      try {
        for (const port of ports) {
          if (this.approvalAborted) return superseded()
          try {
            const socket = await this.openSocket(port)
            this.attachSocket(socket)
            if (this.approvalAborted) {
              this.close()
              return superseded()
            }
            const result = await this.requestOnOpenSocket("pairing.request", {
              clientId: identity.clientId,
              trigger: "user",
              ...this.client
            })
            if (result && result.authenticated === true) {
              return { handshake: await this.adoptHandshake(result, port) }
            }
            this.close()
            bestError = preferredBridgeError(bestError, new BridgeError(
              "pairing_declined", "Tab Space did not approve this browser."))
          } catch (error) {
            this.close()
            if (this.approvalAborted) return superseded()
            // An app that predates approval answers the unknown method with
            // `pairing_required`, which is also the honest thing to report.
            bestError = preferredBridgeError(bestError, error)
          }
        }
        return { error: bestError }
      } finally {
        if (announce) clearTimeout(announce)
        this.awaitingApproval = false
      }
    }

    async adoptHandshake(result, port) {
      const values = { [STORAGE_KEYS.bridgePort]: port }
      if (result.token) values[STORAGE_KEYS.authToken] = result.token
      await this.storage.set(values)
      this.handshake = result
      this.resetReconnect()
      if (this.onConnected) {
        try { this.onConnected(result) } catch (_) {}
      }
      return result
    }

    openSocket(port) {
      return new Promise((resolve, reject) => {
        let settled = false
        let socket
        try {
          socket = new this.WebSocket(`ws://127.0.0.1:${port}/tabspace/v2`)
        } catch (error) {
          // The browser refused to create the socket at all — Safari throws a
          // SecurityError from the constructor in some contexts. Nothing was
          // connected, so this is a transport failure like a refused port,
          // and callers that fall back on those must fall back on it too.
          reject(new BridgeError(
            "connection_failed",
            `Could not open a connection to Tab Space (${error && error.name || "error"}).`
          ))
          return
        }
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          try { socket.close() } catch (_) {}
          reject(new BridgeError("connection_timeout", "Timed out connecting to Tab Space."))
        }, this.connectTimeout)
        socket.onopen = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(socket)
        }
        socket.onerror = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(new BridgeError("connection_failed", "Could not connect to Tab Space."))
        }
      })
    }

    attachSocket(socket) {
      this.socket = socket
      this.handshake = null
      socket.onmessage = message => this.handleMessage(message.data)
      socket.onclose = () => {
        if (this.socket === socket) {
          this.socket = null
          this.handshake = null
        }
        this.rejectPending(new BridgeError("connection_closed", "The Tab Space connection closed."))
        // The helper restarts whenever Tab Space is rebuilt or updated, which
        // drops every browser's socket. Reconnect on our own instead of waiting
        // for the user to open the popup again.
        this.scheduleReconnect()
      }
      socket.onerror = () => {}
    }

    scheduleReconnect() {
      if (this.reconnectTimer) return
      const delay = this.reconnectDelays[
        Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1)
      ]
      this.reconnectAttempts += 1
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        // An unpaired browser whose approval socket the helper closed has
        // nothing to reconnect with, and retrying would knock on every helper
        // on the machine every fifteen seconds for as long as it ran.
        this.hasCredential()
          .then(paired => {
            if (paired) return this.connect({ trigger: "background" })
          })
          .catch(() => this.scheduleReconnect())
      }, delay)
      this.ensureReconnectAlarm()
    }

    cancelReconnect() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    }

    resetReconnect() {
      this.cancelReconnect()
      this.reconnectAttempts = 0
    }

    // The durable wake-up. A suspended background context loses setTimeout, and
    // it is only revived by an event it holds a listener for, so the alarm is
    // the floor under every other recovery path.
    //
    // It stays armed for the life of the extension instead of only while a
    // retry is pending, because the context is normally suspended *while
    // connected* — the socket dies with it and there is no pending retry left
    // to carry an alarm. Re-creating it on each wake-up is harmless: a context
    // that stays suspended keeps the alarm it was started by.
    ensureReconnectAlarm() {
      if (!this.alarmApi || this.reconnectAlarmArmed) return
      this.reconnectAlarmArmed = true
      try {
        this.alarmApi.create(RECONNECT_ALARM_NAME, { periodInMinutes: 1 })
      } catch (_) {}
    }

    handleMessage(rawMessage) {
      let message
      try {
        message = JSON.parse(rawMessage)
      } catch (_) {
        return
      }
      if (message.version !== PROTOCOL_VERSION) return
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error) {
          pending.reject(new BridgeError(message.error.code || "native_error", message.error.message, message.error.details))
        } else {
          pending.resolve(message.result || {})
        }
        return
      }
      if (message.event) {
        for (const listener of this.listeners) listener(message)
      }
    }

    rejectPending(error) {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(error)
      }
      this.pending.clear()
    }

    // Ten seconds is the right budget for what Tab Space answers locally — a
    // database read, a settings write. It is the wrong one for the ai.* methods:
    // those go out to the Tab Space worker and then to a model, and a large
    // split is allowed up to 60 s there (AIClient.swift) before it gives up and
    // reports WHY. Timing out first threw that answer away and left the
    // dashboard waiting on a reply that would never come — a user with a
    // 449-tab group saw a spinner that never stopped, for a request the worker
    // had in fact refused in two milliseconds. The AI budget is deliberately
    // longer than the app's own, so the typed error always wins the race.
    timeoutFor(method) {
      const name = String(method)
      if (name.indexOf("ai.") === 0) return this.aiRequestTimeout
      // An approval request waits on a person reading a prompt on their Mac.
      // Deliberately longer than the app's own prompt timeout, for the same
      // reason the AI budget is: the app's typed answer — approved, declined,
      // or not visible — has to win the race against this timer.
      if (name.indexOf("pairing.") === 0) return this.pairingRequestTimeout
      return this.requestTimeout
    }

    requestOnOpenSocket(method, params) {
      if (!this.socket || this.socket.readyState !== 1) {
        return Promise.reject(new BridgeError("not_connected", "Tab Space is not connected."))
      }
      const id = randomId("request")
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new BridgeError("request_timeout", `Tab Space did not answer ${method}.`))
        }, this.timeoutFor(method))
        this.pending.set(id, { resolve, reject, timer })
        this.socket.send(JSON.stringify({ version: PROTOCOL_VERSION, id, method, params: params || {} }))
      })
    }

    async request(method, params) {
      await this.connect()
      return this.requestOnOpenSocket(method, params)
    }

    async pair(pairingCode) {
      if (!/^\d{6}$/.test(String(pairingCode || ""))) {
        throw new BridgeError("invalid_pairing_code", "Enter the six-digit code shown by the Tab Space app.")
      }
      // The stored token is deliberately left alone. It is already left out of
      // a code handshake, and discarding it up front meant a code typed at the
      // wrong moment — a helper not running yet, a rate limit — destroyed a
      // credential that still worked.
      this.abortApproval()
      this.close()
      const handshake = await this.connect({ pairingCode: String(pairingCode), trigger: "user" })
      return {
        paired: true,
        protocolVersion: handshake.protocolVersion,
        capabilities: handshake.capabilities || []
      }
    }

    close() {
      const socket = this.socket
      this.socket = null
      this.handshake = null
      if (socket) {
        socket.onclose = null
        try { socket.close() } catch (_) {}
      }
      this.rejectPending(new BridgeError("connection_closed", "The Tab Space connection closed."))
    }
  }

  function createController(options) {
    const browserApi = options.browserApi
    const client = options.client
    const browserCommand = options.browserCommand || (() => Promise.reject(
      new BridgeError("unsupported_command", "This dashboard browser command is unavailable.")))
    const delay = options.delay || (milliseconds =>
      new Promise(resolve => root.setTimeout(resolve, milliseconds)))
    const notifyDashboards = options.notifyDashboards || createDashboardChangeNotifier(browserApi)

    async function listPopupTabs() {
      const [tabs, activeTabs] = await Promise.all([
        browserApi.queryTabs({ currentWindow: true }),
        browserApi.queryTabs({ active: true, currentWindow: true })
      ])
      const activeId = activeTabs && activeTabs[0] && activeTabs[0].id
      if (activeTabs && activeTabs[0] && activeTabs[0].url === "") {
        throw new BridgeError(
          "website_access_required",
          "Allow Tab Space access to this website in Safari, then try again."
        )
      }
      return normalizeTabs(tabs).map(tab => ({ ...tab, isCurrent: tab.id === activeId }))
    }

    async function listSwitcherTabs() {
      return normalizeTabs(await browserApi.queryTabs({}))
    }

    async function activateSwitcherTab(tabId, windowId) {
      if (!Number.isInteger(tabId)) {
        throw new BridgeError("invalid_tab", "The requested browser tab is invalid.")
      }
      if (Number.isInteger(windowId)) {
        // Firefox only switches the focused tab within a window; bringing the
        // target window forward first makes cross-window activation work there.
        // Restoring minimized windows requires the explicit normal state.
        await browserApi.updateWindow(windowId, { state: "normal", focused: true })
      }
      await browserApi.updateTab(tabId, { active: true })
      return { activated: true }
    }

    // The app only sends this after the store has confirmed the save, so these
    // ids always name tabs that are already archived.
    async function closeSwitcherTabs(tabIds) {
      const ids = Array.isArray(tabIds)
        ? Array.from(new Set(tabIds.filter(Number.isInteger)))
        : []
      if (ids.length === 0) return { closed: 0 }

      try {
        await browserApi.removeTabs(ids)
      } catch (error) {
        // A single id the user closed in the meantime rejects the whole batch,
        // so retry one at a time before giving up on the rest. Pass the scalar
        // form here: Safari accepts a tab id but rejects a one-element array,
        // while Chromium and Firefox accept both forms.
        for (const id of ids) {
          try {
            await browserApi.removeTabs(id)
          } catch (singleError) {
            // Counted below, not here.
          }
        }
      }

      // Safari resolves tabs.remove before tabs.query stops returning the
      // removed tab. Poll that eventually-consistent snapshot briefly so the
      // app does not report a successful close as a failure. Chromium and
      // Firefox normally finish on the first query and pay no delay.
      let closed = 0
      for (const wait of [0, 25, 50, 100, 200, 400]) {
        if (wait > 0) await delay(wait)
        const remaining = new Set((await browserApi.queryTabs({})).map(tab => tab.id))
        closed = ids.filter(id => !remaining.has(id)).length
        if (closed === ids.length) break
      }
      return { closed }
    }

    async function settingEnabled(name) {
      const result = await client.request("settings.get", { name })
      return result && result.value === "true"
    }

    function sessionForTabs(tabs) {
      return {
        timestamp: Math.floor(Date.now() / 1000),
        title: "",
        sites: tabs.map(tab => ({ title: tab.title, url: tab.url })),
        tags: []
      }
    }

    async function appendTabs(tabs, options = {}) {
      const ignorePinned = await settingEnabled("ignore-pinned-tabs")
      let normalizedTabs = normalizeTabs(tabs, { ignorePinned })
      let sessions

      if (options.allWindowsIfEnabled && await settingEnabled("save-all-windows")) {
        normalizedTabs = normalizeTabs(await browserApi.queryTabs({}), { ignorePinned })
        const tabsByWindow = new Map()
        for (const tab of normalizedTabs) {
          if (!tabsByWindow.has(tab.windowId)) tabsByWindow.set(tab.windowId, [])
          tabsByWindow.get(tab.windowId).push(tab)
        }
        sessions = Array.from(tabsByWindow.values(), sessionForTabs)
      } else {
        sessions = normalizedTabs.length > 0 ? [sessionForTabs(normalizedTabs)] : []
      }

      if (normalizedTabs.length === 0) {
        throw new BridgeError("no_web_tabs", "There are no web tabs to save.")
      }
      const destinationSessionUuid = typeof options.destinationSessionUuid === "string"
        ? options.destinationSessionUuid
        : ""
      const result = destinationSessionUuid
        ? await client.request("sessions.appendTo", {
            uuid: destinationSessionUuid,
            sites: normalizedTabs.map(tab => ({ title: tab.title, url: tab.url }))
          })
        : await client.request("sessions.append", { sessions })
      // Awaited, not fire-and-forget: on Safari the work has to finish inside
      // the action's promise or the suspended context drops it.
      await notifyDashboards(result && result.revision).catch(() => {})
      return {
        savedCount: normalizedTabs.length,
        tabIds: normalizedTabs.map(tab => tab.id),
        appendedToExisting: destinationSessionUuid.length > 0,
        result
      }
    }

    async function saveTabIds(tabIds, options = {}) {
      const wanted = new Set((tabIds || []).filter(Number.isInteger))
      const tabs = await browserApi.queryTabs({ currentWindow: true })
      const activeTabId = options.preserveActiveTab
        ? (tabs.find(tab => tab.active) || {}).id
        : null
      const result = await appendTabs(tabs.filter(tab => wanted.has(tab.id)), options)
      const postSaveErrors = []
      let closedTabs = false
      let openedDashboard = false

      // Preserving the active tab only keeps the window alive while its other
      // tabs close. So the dashboard opens first; once it is in this window it
      // carries the window, and the active tab — saved like the rest — closes
      // too. It is kept only when the dashboard did not land here.
      let dashboardWindowId
      const dashboardFirst = Number.isInteger(activeTabId) && options.openDashboardAfterSave
      if (dashboardFirst) {
        try {
          const opened = await openDashboard()
          openedDashboard = true
          dashboardWindowId = opened && opened.windowId
        } catch (error) {
          postSaveErrors.push({ action: "openDashboard", error: serializeError(error) })
        }
      }
      if (options.closeTabsAfterSave && result.tabIds.length > 0) {
        try {
          const activeWindowId = (tabs.find(tab => tab.id === activeTabId) || {}).windowId
          const keepActive = Number.isInteger(activeTabId) &&
            !(Number.isInteger(dashboardWindowId) && dashboardWindowId === activeWindowId)
          const idsToClose = keepActive
            ? result.tabIds.filter(id => id !== activeTabId)
            : result.tabIds
          if (idsToClose.length > 0) await browserApi.removeTabs(idsToClose)
          closedTabs = true
        } catch (error) {
          postSaveErrors.push({ action: "closeTabs", error: serializeError(error) })
        }
      }
      if (options.openDashboardAfterSave && !dashboardFirst) {
        try {
          await openDashboard()
          openedDashboard = true
        } catch (error) {
          postSaveErrors.push({ action: "openDashboard", error: serializeError(error) })
        }
      }

      return { ...result, closedTabs, openedDashboard, postSaveErrors }
    }

    async function saveCurrentTab() {
      const tabs = await browserApi.queryTabs({ active: true, currentWindow: true })
      return appendTabs(tabs)
    }

    async function listPopupSessions() {
      const result = await client.request("sessions.list", {})
      return popupSessionOptions(result && result.sessions)
    }

    async function restoreSessions(sessions) {
      const sites = (sessions || []).flatMap(session => Array.isArray(session.sites) ? session.sites : [])
      let first = true
      let restoredCount = 0
      for (const site of sites) {
        if (!isSavableUrl(site.url)) continue
        await browserApi.createTab({ url: site.url, active: first })
        first = false
        restoredCount += 1
      }
      return { restoredCount }
    }

    // Where the dashboard ended up, when the browser says: Save & Close uses it
    // to decide whether the saving window still needs a tab of its own.
    function withWindow(result, windowId) {
      return Number.isInteger(windowId) ? { ...result, windowId } : result
    }

    async function openDashboard() {
      // Filtering by URL here avoids browser-specific match-pattern handling
      // for the localhost development origin, especially Firefox's rejection
      // of explicit ports in match patterns.
      const matches = (await browserApi.queryTabs({})).filter(tab => isDashboardUrl(tab.url))
      if (!matches || matches.length === 0) {
        const created = await browserApi.createTab({ url: browserApi.dashboardUrl(), active: true })
        return withWindow({ reused: false }, created && created.windowId)
      }
      // Prefer the dashboard in the window the user is looking at. After a
      // Save & Close that window is nearly empty, and a dashboard activated in
      // some other window would leave them staring at the wrong one — so a
      // dashboard elsewhere is only reused together with its window.
      const [current] = await browserApi.queryTabs({ active: true, currentWindow: true })
      const currentWindowId = current ? current.windowId : undefined
      const match = matches.find(tab => tab.windowId === currentWindowId) || matches[0]
      await browserApi.updateTab(match.id, { active: true })
      if (Number.isInteger(match.windowId) && match.windowId !== currentWindowId
          && typeof browserApi.updateWindow === "function") {
        await browserApi.updateWindow(match.windowId, { state: "normal", focused: true })
      }
      return withWindow({ reused: true }, match.windowId)
    }

    async function handleDashboard(message) {
      const operation = dashboardCommandToOperation(message)
      let result
      if (operation.kind === "native") {
        try {
          result = await client.request(operation.method, operation.params)
          if (operation.method === "settings.set" && BUILD_TARGET === "safari" && root.TabSpaceSafariMenu) {
            await browserApi.removeStorage([root.TabSpaceSafariMenu.SETTINGS_CACHED_AT_KEY]).catch(() => {})
          }
        } catch (error) {
          // A refused split is the answer the preview dialog is waiting for,
          // not a transport failure — and the Safari direct bridge has no
          // request-error channel at all, so it has to travel as a message.
          // Duck-typed: the Safari native fallback rethrows a plain Error that
          // carries only the code.
          if (operation.method === "sessions.saveSplit" && error && typeof error.code === "string") {
            return { messages: [splitSavedMessage(operation, error)], result: null }
          }
          throw error
        }
      } else if (operation.kind === "local") {
        result = operation.result
      } else if (operation.kind === "browser-command") {
        result = await browserCommand(operation.method, operation.params)
      } else if (operation.method === "dashboard.open") {
        result = await openDashboard()
      } else {
        result = await restoreSessions(operation.params.sessions)
      }
      return { messages: dashboardMessagesFor(operation, result), result }
    }

    return {
      listPopupTabs,
      listSwitcherTabs,
      listPopupSessions,
      saveTabIds,
      saveCurrentTab,
      restoreSessions,
      openDashboard,
      handleDashboard,
      activateSwitcherTab,
      closeSwitcherTabs,
      closeTabs(tabIds) { return browserApi.removeTabs(tabIds) },
      pair(code) { return client.pair(code) },
      connect(options) {
        return client.connect(options).then(handshake => ({
          connected: true,
          protocolVersion: handshake.protocolVersion,
          capabilities: dashboardCapabilities(handshake.capabilities)
        }))
      }
    }
  }

  function handleSwitcherEvent(event, controller, client) {
    if (!event || typeof event.requestID !== "string" || event.requestID.length === 0) {
      return null
    }
    if (event.event === "switcher.tabs.request") {
      return controller.listSwitcherTabs().then(tabs => client.request("switcher.tabs.publish", {
        requestID: event.requestID,
        tabs
      }))
    }
    if (event.event === "switcher.tab.activate") {
      return controller.activateSwitcherTab(event.tabID, event.windowID).then(
        () => client.request("switcher.tab.activated", {
          requestID: event.requestID,
          activated: true
        }),
        () => client.request("switcher.tab.activated", {
          requestID: event.requestID,
          activated: false
        })
      )
    }
    if (event.event === "switcher.tabs.close") {
      // Always answer, even on failure. The app waits on this reply to decide
      // whether to tell the user their tabs are saved but still open; staying
      // silent would leave it waiting for the 3 s timeout to say the same thing.
      return controller.closeSwitcherTabs(event.tabIDs).then(
        result => client.request("switcher.tabs.closed", {
          requestID: event.requestID,
          closed: result.closed
        }),
        error => client.request("switcher.tabs.closed", {
          requestID: event.requestID,
          closed: 0,
          error: serializeError(error)
        })
      )
    }
    return null
  }

  function serializeError(error) {
    return {
      code: error && error.code ? error.code : "unexpected_error",
      message: error && error.message ? error.message : "Unexpected Tab Space error."
    }
  }

  function install() {
    const extensionApi = root.browser || root.chrome
    if (!extensionApi || !root.WebSocket) return
    const preferPromises = Boolean(root.browser)
    const api = createBrowserApi(extensionApi, preferPromises)
    const manifest = api.manifest()
    const client = new LocalBridgeClient({
      WebSocket: root.WebSocket,
      alarmApi: extensionApi.alarms,
      storage: {
        get: keys => api.getStorage(keys),
        set: values => api.setStorage(values),
        remove: keys => api.removeStorage(keys)
      },
      client: {
        browser: BUILD_TARGET === "safari"
          ? "safari"
          : browserFamily(root.navigator && root.navigator.userAgent),
        extensionVersion: manifest.version,
        protocolVersion: PROTOCOL_VERSION,
        capabilities: [SWITCHER_CAPABILITY, SWITCHER_CLOSE_CAPABILITY]
      },
      onConnected: handshake => announceBridgeConnected(handshake),
      onAwaitingApproval: details => announceAwaitingApproval(details),
      pairingCodeProvider: BUILD_TARGET === "safari"
        ? async () => safariBridgeCredential(root.TabSpaceSafariNative, (await client.identity()).clientId)
        : null
    })
    const commandClient = BUILD_TARGET === "safari" && root.TabSpaceSafariMenu
      ? root.TabSpaceSafariMenu.commandClient(client)
      : client
    const notifyDashboards = createDashboardChangeNotifier(api)
    let controller
    controller = createController({
      browserApi: api,
      client: commandClient,
      notifyDashboards,
      browserCommand: (command, data) => {
        if (BUILD_TARGET !== "safari" || !root.TabSpaceSafariMenu) {
          return Promise.reject(new BridgeError("unsupported_command", `Unsupported browser command: ${command}`))
        }
        return root.TabSpaceSafariMenu.performCommand(command, data || {}, {
          api: extensionApi,
          controller,
          client: commandClient
        })
      }
    })
    const dashboardPorts = new Set()

    // Dashboards are found at the moment of the announcement rather than
    // through the port each one opened at load. That port does not survive the
    // background going idle, and an unpaired browser has no socket traffic to
    // keep it awake — so by the time someone approves the browser, the port to
    // the dashboard they are looking at is usually already gone.
    async function postToDashboards(payload) {
      const dashboards = await queryDashboardTabs(api)
      await Promise.all(dashboards.map(tab =>
        api.sendTabMessage(tab.id, payload).catch(() => {})))
    }

    // Extension pages — the popup — are told through runtime messages, because
    // the popup can be closed and reopened while the app is still waiting for
    // the person to answer the prompt.
    function postToExtensionPages(payload) {
      try {
        if (preferPromises) {
          const sent = extensionApi.runtime.sendMessage(payload)
          if (sent && typeof sent.catch === "function") sent.catch(() => {})
          return
        }
        extensionApi.runtime.sendMessage(payload, () => {
          // Read so a closed popup does not log an unchecked lastError.
          void (extensionApi.runtime && extensionApi.runtime.lastError)
        })
      } catch (_) {}
    }

    function announceBridgeConnected(handshake) {
      const result = {
        connected: true,
        protocolVersion: handshake && handshake.protocolVersion,
        capabilities: dashboardCapabilities(handshake && handshake.capabilities)
      }
      postToDashboards({ type: "dashboard.bridgeConnected", result }).catch(() => {})
      postToExtensionPages({ type: "bridge-connected", result })
    }

    function announceAwaitingApproval(details) {
      postToExtensionPages({ type: "pairing-awaiting", ...(details || {}) })
    }

    client.addEventListener(event => {
      if (event.event === "bridge.keepalive") {
        // Chrome and Edge treat WebSocket traffic as service worker activity,
        // so their keepalive needs no help. Firefox does not: it terminates an
        // idle event page after ~30s and only counts WebExtension API events,
        // which would drop this browser off the switcher a few seconds after
        // every wake-up. Turning the keepalive into a storage write that the
        // listener below observes is the event Firefox does count.
        Promise.resolve(api.touchSessionStorage(Date.now())).catch(() => {})
        return
      }
      const switcherAction = handleSwitcherEvent(event, controller, client)
      if (switcherAction) {
        switcherAction.catch(() => {})
        return
      }
      // Query at event time so every open dashboard receives the invalidation,
      // including pages whose long-lived port was discarded while Safari's
      // background context slept.
      if (event.event === "sessions.changed") {
        notifyDashboards(event.revision).catch(() => {})
        return
      }
      sendDashboardEvent(api, event).catch(() => {})
    })

    function wakeBridge() {
      // An unpaired browser has nothing to say: knocking anyway woke every
      // helper on the machine once a minute, and each refusal was recorded as a
      // failed setup on the Mac side.
      client.hasCredential()
        .then(paired => { if (paired) return client.connect({ trigger: "background" }) })
        .catch(() => {})
    }

    // Wake-ups. A suspended background context is revived only by an event it
    // registered a listener for, and the extension's other listeners all need
    // the user to act: closing a browser's last window suspends the context,
    // and opening a new one woke nothing, so that browser stayed off the
    // switcher until its toolbar button was clicked. Reproduced on Edge.
    //
    // onFocusChanged is included because it also fires when the browser loses
    // focus, which is the moment right before the global hot key is pressed.
    if (extensionApi.alarms && extensionApi.alarms.onAlarm) {
      extensionApi.alarms.onAlarm.addListener(alarm => {
        if (alarm.name !== RECONNECT_ALARM_NAME) return
        wakeBridge()
      })
    }
    if (extensionApi.runtime.onStartup) extensionApi.runtime.onStartup.addListener(wakeBridge)
    if (extensionApi.runtime.onInstalled) extensionApi.runtime.onInstalled.addListener(wakeBridge)
    if (extensionApi.windows) {
      if (extensionApi.windows.onCreated) extensionApi.windows.onCreated.addListener(wakeBridge)
      if (extensionApi.windows.onFocusChanged) extensionApi.windows.onFocusChanged.addListener(wakeBridge)
    }
    // Registered so the keepalive write above dispatches an event at all; the
    // dispatch is the whole point, so the listener itself has nothing to do.
    if (extensionApi.storage && extensionApi.storage.onChanged) {
      extensionApi.storage.onChanged.addListener(() => {})
    }

    extensionApi.runtime.onConnect.addListener(port => {
      if (port.name !== "tabspace-dashboard") return
      dashboardPorts.add(port)
      port.onDisconnect.addListener(() => dashboardPorts.delete(port))
    })

    extensionApi.runtime.onMessage.addListener((message, sender) => {
      const type = message && message.type
      const dashboardRequest = type && type.startsWith("dashboard.")
      if (dashboardRequest && !(sender && isDashboardUrl(sender.url))) {
        return Promise.resolve({ ok: false, error: { code: "invalid_sender", message: "Dashboard origin rejected." } })
      }

      const action = (() => {
        switch (type) {
          // Loading the dashboard is not a request to pair: a restored session
          // reopens dashboard tabs with nobody at the keyboard, and a refused
          // browser would be asked again on every reload. The popup is where a
          // person asks to connect.
          case "dashboard.connect": return controller.connect({ trigger: "user" })
          case "dashboard.request": return controller.handleDashboard(message.message)
          case "popup.connect": return controller.connect({ trigger: "user", requestApproval: true })
          case "popup.subscriptionStatus": return client.request("subscription.status", {})
          case "popup.openPaywall": return client.request("subscription.purchase", typeof message.productId === "string" ? { productId: message.productId } : {})
          case "popup.listTabs": return controller.listPopupTabs()
          case "popup.listSessions": return controller.listPopupSessions()
          case "popup.saveTabs": return controller.saveTabIds(message.tabIds, {
            allWindowsIfEnabled: message.allWindowsIfEnabled === true,
            openDashboardAfterSave: message.openDashboardAfterSave === true,
            closeTabsAfterSave: message.closeTabsAfterSave === true,
            destinationSessionUuid: typeof message.destinationSessionUuid === "string"
              ? message.destinationSessionUuid
              : ""
          })
          case "popup.closeTabs": return controller.closeTabs(message.tabIds).then(() => ({ closed: true }))
          case "popup.openDashboard": return controller.openDashboard()
          case "safari.settings":
            if (BUILD_TARGET !== "safari" || !root.TabSpaceSafariMenu) {
              return Promise.reject(new BridgeError("unsupported_message", "Safari settings are unavailable."))
            }
            return root.TabSpaceSafariMenu.cachedSettings({ api: extensionApi, controller, client })
          case "safari.menuTelemetry":
            if (BUILD_TARGET !== "safari" || !root.TabSpaceSafariMenu) {
              return Promise.reject(new BridgeError("unsupported_message", "Safari menu telemetry is unavailable."))
            }
            return root.TabSpaceSafariMenu.recordMenu(commandClient, "fallback")
          case "safari.command":
            if (BUILD_TARGET !== "safari" || !root.TabSpaceSafariMenu) {
              return Promise.reject(new BridgeError("unsupported_message", "Safari commands are unavailable."))
            }
            return root.TabSpaceSafariMenu.performCommand(message.command, message.data || {}, {
              api: extensionApi,
              controller,
              client
            })
          case "safari.redirect":
            if (BUILD_TARGET !== "safari" || !(sender && sender.tab && Number.isInteger(sender.tab.id))) {
              return Promise.reject(new BridgeError("invalid_sender", "Safari redirect sender rejected."))
            }
            return api.updateTab(sender.tab.id, { url: api.dashboardUrl() })
          // The dashboards are told by the client's own connected callback, so
          // this no longer has to announce the handshake itself.
          case "popup.pair": return controller.pair(message.code)
          default: return Promise.reject(new BridgeError("unsupported_message", `Unsupported extension message: ${type}`))
        }
      })()
      return Promise.resolve(action)
        .then(result => ({ ok: true, result }))
        .catch(error => ({ ok: false, error: serializeError(error) }))
    })

    if (extensionApi.commands && extensionApi.commands.onCommand) {
      extensionApi.commands.onCommand.addListener(command => {
        if (command === "open-tab-space") controller.openDashboard().catch(() => {})
        if (command === "save-current-tab") {
          controller.saveCurrentTab().then(() => controller.openDashboard()).catch(() => {})
        }
      })
    }

    if (BUILD_TARGET === "safari" && root.TabSpaceSafariMenu) {
      root.TabSpaceSafariMenu.install({ api: extensionApi, controller, client })
    }

    client.ensureReconnectAlarm()
    verifySafariNativeRoundTrip()
    // A paired extension must be ready before its popup or dashboard is opened,
    // otherwise the global switcher cannot discover this browser. Every wake-up
    // re-runs this file, so this is also the reconnect for all of them.
    wakeBridge()
  }

  return {
    BridgeError,
    LocalBridgeClient,
    PROTOCOL_VERSION,
    SWITCHER_CAPABILITY,
    SWITCHER_CLOSE_CAPABILITY,
    dashboardCommandToOperation,
    dashboardCapabilities,
    dashboardMessageForEvent,
    dashboardMessagesFor,
    sendDashboardEvent,
    createDashboardChangeNotifier,
    browserFamily,
    createController,
    handleSwitcherEvent,
    isDashboardOrigin,
    isDashboardUrl,
    isSavableTab,
    isSavableUrl,
    normalizeTabs,
    popupSessionOptions,
    portCandidates,
    preferredBridgeError,
    isTransportError,
    safariBridgeCredential,
    serializeError,
    install
  }
})
