(function (root, factory) {
  const exported = factory(root)
  if (typeof module === "object" && module.exports) {
    module.exports = exported
  } else {
    exported.install()
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict"

  const PROTOCOL_VERSION = 2
  const INITIAL_PORT = 53791
  const PORT_STEP = 17
  const PORT_ATTEMPTS = 10
  // build.mjs rewrites these two lines for development builds. The first entry
  // is the origin the extension opens; the suffixes cover Cloudflare Pages
  // preview deployments, which get a new hostname per branch.
  const DASHBOARD_ORIGINS = ["https://app.mytab.space"]
  const DASHBOARD_ORIGIN_SUFFIXES = []
  const DASHBOARD_ORIGIN = DASHBOARD_ORIGINS[0]
  const STORAGE_KEYS = {
    clientId: "tabspace-client-id",
    authToken: "tabspace-auth-token"
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

  function portCandidates() {
    return Array.from({ length: PORT_ATTEMPTS }, (_, index) => INITIAL_PORT + PORT_STEP * index)
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

  function toolbarIconPaths(colorScheme) {
    const prefix = colorScheme === "dark" ? "toolbar-light" : "toolbar"
    return Object.fromEntries([16, 32, 48, 128].map(size => [size, `${prefix}-${size}.png`]))
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
      case "CheckBookmarks":
        return { kind: "native", method: "sessions.list", params: {} }
      case "AppendSessions":
        return { kind: "native", method: "sessions.append", params: { sessions: parseBookmarks(msg.bookmarks) } }
      case "UpdateSession":
        return { kind: "native", method: "sessions.update", params: { sessions: parseBookmarks(msg.bookmarks) } }
      case "DeleteSession":
        return { kind: "native", method: "sessions.delete", params: { sessions: parseBookmarks(msg.bookmarks) } }
      case "MergeSessions":
        return {
          kind: "native",
          method: "sessions.merge",
          params: {
            sessions: parseBookmarks(msg.bookmarks),
            deduplicateSites: msg.deduplicateSites === true
          }
        }
      case "UpSession":
        return { kind: "native", method: "sessions.up", params: { sessions: parseBookmarks(msg.bookmarks) } }
      case "MoveSession":
        return { kind: "native", method: "sessions.move", params: { uuids: msg.uuids || [] } }
      case "CheckDefault":
        return { kind: "native", method: "settings.get", params: { name: msg.name } }
      case "SetDefault":
        return { kind: "native", method: "settings.set", params: { name: msg.name, value: msg.value } }
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
            originalUuid: msg.originalUuid || ""
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
          params: typeof msg.productId === "string" ? { productId: msg.productId } : {}
        }
      case "RestorePurchases":
        return { kind: "native", method: "subscription.restore", params: {} }
      case "RestoreSession":
        return { kind: "browser", method: "tabs.restore", params: { sessions: parseBookmarks(msg.bookmarks) } }
      default:
        throw new BridgeError("unsupported_command", `Unsupported dashboard command: ${msg.cmd || "(missing)"}`)
    }
  }

  function dashboardMessagesFor(operation, result) {
    if (operation.kind === "browser") return []
    if (operation.method.startsWith("sessions.") || operation.method === "backups.restore") {
      if (Array.isArray(result && result.sessions)) {
        return [{ cmd: "ReturnBookmarks", bookmarks: result.sessions, source: "local-bridge" }]
      }
      return []
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
    if (operation.method === "subscription.status" || operation.method === "subscription.restore") {
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
      removeTabs(ids) { return call(extensionApi.tabs, "remove", ids) },
      getStorage(keys) { return call(extensionApi.storage.local, "get", keys) },
      setStorage(values) { return call(extensionApi.storage.local, "set", values) },
      removeStorage(keys) { return call(extensionApi.storage.local, "remove", keys) },
      setActionIcon(details) { return call(extensionApi.action, "setIcon", details) },
      manifest() { return extensionApi.runtime.getManifest() },
      dashboardUrl() { return `${DASHBOARD_ORIGIN}/` },
      raw: extensionApi
    }
  }

  class LocalBridgeClient {
    constructor(options) {
      this.WebSocket = options.WebSocket
      this.storage = options.storage
      this.client = options.client
      this.connectTimeout = options.connectTimeout || 650
      this.socket = null
      this.handshake = null
      this.pending = new Map()
      this.connectPromise = null
      this.listeners = new Set()
    }

    addEventListener(listener) {
      this.listeners.add(listener)
      return () => this.listeners.delete(listener)
    }

    async identity() {
      const values = await this.storage.get([STORAGE_KEYS.clientId, STORAGE_KEYS.authToken])
      let clientId = values[STORAGE_KEYS.clientId]
      if (!clientId) {
        clientId = randomId("browser")
        await this.storage.set({ [STORAGE_KEYS.clientId]: clientId })
      }
      return { clientId, authToken: values[STORAGE_KEYS.authToken] || "" }
    }

    async connect(pairingCode) {
      if (this.socket && this.socket.readyState === 1) return this.handshake || {}
      if (this.connectPromise) return this.connectPromise
      this.connectPromise = this.connectAcrossPorts(pairingCode).finally(() => {
        this.connectPromise = null
      })
      return this.connectPromise
    }

    async connectAcrossPorts(pairingCode) {
      const identity = await this.identity()
      let lastError = null
      for (const port of portCandidates()) {
        try {
          const socket = await this.openSocket(port)
          this.attachSocket(socket)
          const result = await this.requestOnOpenSocket("hello", {
            clientId: identity.clientId,
            token: identity.authToken,
            pairingCode: pairingCode || "",
            ...this.client
          })
          if (!result || result.authenticated !== true) {
            throw new BridgeError("authentication_failed", "Tab Space rejected the browser connection.")
          }
          if (result.token) {
            await this.storage.set({ [STORAGE_KEYS.authToken]: result.token })
          }
          this.handshake = result
          return result
        } catch (error) {
          lastError = error
          this.close()
          if (error && [
            "pairing_required",
            "invalid_pairing_code",
            "pairing_rate_limited",
            "invalid_client",
            "authentication_failed",
            "credential_store_failed",
            // Terminal: without Pro no amount of retrying or re-pairing helps.
            "pro_required"
          ].includes(error.code)) {
            throw error
          }
        }
      }
      if (!lastError || ["connection_failed", "connection_timeout", "connection_closed"].includes(lastError.code)) {
        throw new BridgeError("helper_unavailable", "Open Tab Space once to enable its browser helper.")
      }
      throw lastError
    }

    openSocket(port) {
      return new Promise((resolve, reject) => {
        let settled = false
        const socket = new this.WebSocket(`ws://127.0.0.1:${port}/tabspace/v2`)
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
      socket.onmessage = message => this.handleMessage(message.data)
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null
        this.rejectPending(new BridgeError("connection_closed", "The Tab Space connection closed."))
      }
      socket.onerror = () => {}
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

    requestOnOpenSocket(method, params) {
      if (!this.socket || this.socket.readyState !== 1) {
        return Promise.reject(new BridgeError("not_connected", "Tab Space is not connected."))
      }
      const id = randomId("request")
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new BridgeError("request_timeout", `Tab Space did not answer ${method}.`))
        }, 10000)
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
      await this.storage.remove([STORAGE_KEYS.authToken])
      this.close()
      const handshake = await this.connect(String(pairingCode))
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

    async function listPopupTabs() {
      const [tabs, activeTabs] = await Promise.all([
        browserApi.queryTabs({ currentWindow: true }),
        browserApi.queryTabs({ active: true, currentWindow: true })
      ])
      const activeId = activeTabs && activeTabs[0] && activeTabs[0].id
      return normalizeTabs(tabs).map(tab => ({ ...tab, isCurrent: tab.id === activeId }))
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
      const result = await appendTabs(tabs.filter(tab => wanted.has(tab.id)), options)
      const postSaveErrors = []
      let closedTabs = false
      let openedDashboard = false

      if (options.closeTabsAfterSave && result.tabIds.length > 0) {
        try {
          await browserApi.removeTabs(result.tabIds)
          closedTabs = true
        } catch (error) {
          postSaveErrors.push({ action: "closeTabs", error: serializeError(error) })
        }
      }
      if (options.openDashboardAfterSave) {
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

    async function openDashboard() {
      // Filtering by URL here avoids browser-specific match-pattern handling
      // for the localhost development origin, especially Firefox's rejection
      // of explicit ports in match patterns.
      const matches = (await browserApi.queryTabs({})).filter(tab => isDashboardUrl(tab.url))
      if (matches && matches.length > 0) {
        await browserApi.updateTab(matches[0].id, { active: true })
        return { reused: true }
      }
      await browserApi.createTab({ url: browserApi.dashboardUrl(), active: true })
      return { reused: false }
    }

    async function handleDashboard(message) {
      const operation = dashboardCommandToOperation(message)
      const result = operation.kind === "native"
        ? await client.request(operation.method, operation.params)
        : await restoreSessions(operation.params.sessions)
      return { messages: dashboardMessagesFor(operation, result), result }
    }

    return {
      listPopupTabs,
      listPopupSessions,
      saveTabIds,
      saveCurrentTab,
      restoreSessions,
      openDashboard,
      handleDashboard,
      closeTabs(tabIds) { return browserApi.removeTabs(tabIds) },
      pair(code) { return client.pair(code) },
      connect() {
        return client.connect().then(handshake => ({
          connected: true,
          protocolVersion: handshake.protocolVersion,
          capabilities: dashboardCapabilities(handshake.capabilities)
        }))
      }
    }
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
      storage: {
        get: keys => api.getStorage(keys),
        set: values => api.setStorage(values),
        remove: keys => api.removeStorage(keys)
      },
      client: {
        browser: browserFamily(root.navigator && root.navigator.userAgent),
        extensionVersion: manifest.version,
        protocolVersion: PROTOCOL_VERSION
      }
    })
    const controller = createController({ browserApi: api, client })
    const dashboardPorts = new Set()
    const offscreenUrl = extensionApi.runtime.getURL("offscreen.html")

    function ensureThemeObserver() {
      if (!extensionApi.offscreen || typeof extensionApi.offscreen.createDocument !== "function") {
        return Promise.resolve()
      }
      return extensionApi.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["MATCH_MEDIA"],
        justification: "Keep the Tab Space toolbar icon legible in light and dark browser themes."
      }).catch(error => {
        // Chrome keeps MATCH_MEDIA documents alive when the service worker is
        // suspended, so a restarted worker may find that one already exists.
        if (!/single offscreen document/i.test(error && error.message ? error.message : String(error))) {
          throw error
        }
      })
    }

    client.addEventListener(event => {
      const message = dashboardMessageForEvent(event)
      if (!message) return
      for (const port of dashboardPorts) {
        try { port.postMessage({ type: "native-message", message }) } catch (_) {}
      }
    })

    extensionApi.runtime.onConnect.addListener(port => {
      if (port.name !== "tabspace-dashboard") return
      dashboardPorts.add(port)
      port.onDisconnect.addListener(() => dashboardPorts.delete(port))
    })

    extensionApi.runtime.onMessage.addListener((message, sender) => {
      const type = message && message.type
      if (type === "ui.colorScheme") {
        if (!(sender && sender.url === offscreenUrl)) {
          return Promise.resolve({ ok: false, error: { code: "invalid_sender", message: "Theme observer rejected." } })
        }
        const colorScheme = message.colorScheme === "dark" ? "dark" : "light"
        return api.setActionIcon({ path: toolbarIconPaths(colorScheme) })
          .then(() => ({ ok: true, result: { colorScheme } }))
          .catch(error => ({ ok: false, error: serializeError(error) }))
      }
      const dashboardRequest = type && type.startsWith("dashboard.")
      if (dashboardRequest && !(sender && isDashboardUrl(sender.url))) {
        return Promise.resolve({ ok: false, error: { code: "invalid_sender", message: "Dashboard origin rejected." } })
      }

      const action = (() => {
        switch (type) {
          case "dashboard.connect": return controller.connect()
          case "dashboard.request": return controller.handleDashboard(message.message)
          case "popup.connect": return controller.connect()
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
          case "popup.pair": return controller.pair(message.code).then(result => {
            for (const port of dashboardPorts) {
              try { port.postMessage({ type: "bridge-connected", result }) } catch (_) {}
            }
            return result
          })
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

    ensureThemeObserver().catch(() => {})
  }

  return {
    BridgeError,
    LocalBridgeClient,
    PROTOCOL_VERSION,
    dashboardCommandToOperation,
    dashboardCapabilities,
    dashboardMessageForEvent,
    dashboardMessagesFor,
    browserFamily,
    toolbarIconPaths,
    createController,
    isDashboardOrigin,
    isDashboardUrl,
    isSavableTab,
    isSavableUrl,
    normalizeTabs,
    popupSessionOptions,
    portCandidates,
    serializeError,
    install
  }
})
