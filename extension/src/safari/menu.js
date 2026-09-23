(function (root, factory) {
  const exported = factory(root)
  if (typeof module === "object" && module.exports) module.exports = exported
  else root.TabSpaceSafariMenu = exported
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict"

  const MENU_INSET_KEY = "tabspace-safari-menu-inset"
  const FALLBACK_POPUP = "popup.html"
  const MENU_TIMEOUT_MS = 24 * 60 * 60 * 1000
  // What the toolbar menu draws: this many recent sessions plus the favorites.
  // NativeMenu.swift takes the same prefix; the host trims the list so the
  // whole library no longer crosses the socket and the native hop per click.
  const MENU_RECENT_LIMIT = 25
  // The menu's last library slice, and how long a click waits for a fresh one
  // before opening with it. The helper answers on the same main thread a
  // CloudKit import occupies, so the wait is occasionally seconds long — and a
  // toolbar button that has not opened a menu reads as broken, not as slow.
  // The request is not abandoned; it refreshes the slice for the next click.
  const MENU_SESSIONS_CACHE_KEY = "tabspace-safari-menu-sessions-v1"
  const MENU_SESSIONS_DEADLINE_MS = 1200
  const SETTINGS_CACHE_KEY = "tabspace-safari-settings-v1"
  const SETTINGS_CACHED_AT_KEY = "tabspace-safari-settings-cached-at-v1"
  // Every page load asks for the shortcut settings, so they are served from
  // storage.local and refreshed at most this often (or when the dashboard
  // writes one). Without the cache each page load cost five bridge round trips
  // — and, with the Helper down, five appex launches.
  const SETTINGS_MAX_AGE_MS = 5 * 60 * 1000
  const REDIRECT_HOSTS = new Set(["mytab.space", "tabspacestatic.joyuer.cn"])
  const REDIRECT_GITHUB_HOSTS = new Set(["joyuer.cn", "yuanzhoucq.github.io"])

  function call(target, method, ...args) {
    if (!target || typeof target[method] !== "function") return Promise.reject(new Error(`Missing Safari API: ${method}`))
    try {
      const result = target[method](...args)
      return result && typeof result.then === "function" ? result : Promise.resolve(result)
    } catch (error) {
      return Promise.reject(error)
    }
  }

  function isTransportError(error) {
    return !!error && [
      "not_connected", "helper_unavailable", "connection_failed",
      "connection_timeout", "connection_closed", "request_timeout",
      // The connection could not be authorized. Only connect() raises these,
      // before any command is sent, so the native handler running the command
      // instead cannot make it run twice.
      "pairing_required", "pairing_code_unavailable", "invalid_pairing_code",
      "pairing_rate_limited", "authentication_failed", "invalid_client",
      "credential_store_failed"
    ].includes(error.code)
  }

  // Only these mean the native menu could not be put on screen. Everything
  // else — a session limit, a lost session, a command that failed after the
  // menu closed — is an ordinary error and must not take the native menu away.
  function isMenuUnavailableError(error) {
    return !!error && [
      "native_unavailable", "native_transport_failed", "native_timeout", "menu_unavailable", "menu_not_shown"
    ].includes(error.code)
  }

  // The native handler itself reported that AppKit could not draw a menu. A
  // transport failure is different: the handler process may simply have been
  // replaced (an update, a rebuild) and the next message relaunches it.
  function isMenuDrawFailure(error) {
    return !!error && ["menu_unavailable", "menu_not_shown"].includes(error.code)
  }

  // The handler declined this click on purpose — it arrived too late to be
  // the menu the user is waiting for, or a menu is already open. Nothing to
  // fall back from; the next click is answered normally.
  function isMenuDeclined(error) {
    return !!error && ["menu_stale", "menu_busy"].includes(error.code)
  }

  // Progress of the flows that end in a write, sent to the native handler so
  // it reaches the system log: a menu pick that saves nothing leaves no other
  // trace outside the background page. Operation names, error codes, counts
  // and durations only — never a URL or a title.
  function trace(step, detail) {
    try {
      const native = root.TabSpaceSafariNative
      if (!native || typeof native.send !== "function") return
      const sent = native.send({
        op: "diagnostics.trace",
        step: String(step).slice(0, 60),
        detail: String(detail === undefined ? "" : detail).slice(0, 160)
      }, { timeoutMs: 3000 })
      if (sent && typeof sent.catch === "function") sent.catch(() => {})
    } catch (_) {}
  }

  async function nativeCommand(method, params) {
    return root.TabSpaceSafariNative.send({
      op: "bridge.command",
      command: method,
      params: params || {}
    })
  }

  async function requestWithFallback(client, method, params) {
    const started = Date.now()
    try {
      return await client.request(method, params || {})
    } catch (error) {
      if (!isTransportError(error)) throw error
      trace("fallback", `${method} after ${error.code} ${Date.now() - started}ms`)
      let response
      try {
        response = await nativeCommand(method, params)
      } catch (nativeError) {
        trace("fallback-failed", `${method} ${nativeError && nativeError.code} ${Date.now() - started}ms`)
        throw nativeError
      }
      if (response && response.error) {
        trace("fallback-failed", `${method} ${response.error.code} ${Date.now() - started}ms`)
        const bridged = new Error(response.error.message || response.error.code)
        bridged.code = response.error.code || "native_error"
        throw bridged
      }
      trace("fallback-done", `${method} ${Date.now() - started}ms`)
      return response && response.result ? response.result : response
    }
  }

  async function recordMenu(client, menu) {
    if (!["native", "fallback"].includes(menu)) return
    await requestWithFallback(client, "diagnostics.safariMenu", { menu })
  }

  function commandClient(client) {
    return {
      request(method, params) { return requestWithFallback(client, method, params) },
      pair(code) { return client.pair(code) },
      connect() { return client.connect() }
    }
  }

  function currentWindowRect(window) {
    if (!window) return null
    return {
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height
    }
  }

  async function setPopup(api, popup) {
    await call(api.action, "setPopup", { popup })
  }

  async function probe(api) {
    try {
      const forced = await call(api.storage.local, "get", ["tabspace-force-popup-fallback"])
      if (forced && forced["tabspace-force-popup-fallback"] === true) {
        await setPopup(api, FALLBACK_POPUP)
        return false
      }
      const result = await root.TabSpaceSafariNative.send({ op: "ui.probe" })
      const available = !!(result && result.available)
      await setPopup(api, available ? "" : FALLBACK_POPUP)
      return available
    } catch (_) {
      await setPopup(api, FALLBACK_POPUP).catch(() => {})
      return false
    }
  }

  function sessionByUuid(sessions, uuid) {
    return (sessions || []).find(session => session && session.uuid === uuid)
  }

  async function restoreUrls(api, urls, concurrency = 8) {
    const queue = (urls || []).filter(url => typeof url === "string" && url.length > 0)
    let next = 0
    let opened = 0
    async function worker() {
      while (next < queue.length) {
        const index = next++
        await call(api.tabs, "create", { url: queue[index], active: index === 0 })
        opened += 1
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
    return { restoredCount: opened }
  }

  async function topDomain(url) {
    const response = await root.TabSpaceSafariNative.send({ op: "url.topDomain", url })
    return response && response.domain
  }

  // Same rules as the Safari App Extension's `getTabs(at:)`: closing to the
  // left or right never touches pinned tabs (they sit at the far left, so
  // Close Left would otherwise take every one of them), Close Other Tabs
  // spares them only when the user asked to ignore pinned tabs, and Close
  // Same Domain treats them like any other tab.
  async function closeRelativeTabs(api, mode, settings = {}) {
    const tabs = await call(api.tabs, "query", { currentWindow: true })
    const active = tabs.find(tab => tab.active)
    if (!active) return { closed: 0 }
    const ignorePinned = settings["ignore-pinned-tabs"] === "true"
    let doomed = []
    if (mode === "right") doomed = tabs.filter(tab => tab.index > active.index && !tab.pinned)
    if (mode === "left") doomed = tabs.filter(tab => tab.index < active.index && !tab.pinned)
    if (mode === "other") doomed = tabs.filter(tab => tab.id !== active.id && !(ignorePinned && tab.pinned))
    if (mode === "domain") {
      const activeDomain = await topDomain(active.url)
      if (activeDomain) {
        const domains = await Promise.all(tabs.map(tab => topDomain(tab.url).catch(() => null)))
        doomed = tabs.filter((tab, index) => tab.id !== active.id && domains[index] === activeDomain)
      }
    }
    const ids = doomed.map(tab => tab.id).filter(Number.isInteger)
    if (ids.length > 0) await call(api.tabs, "remove", ids)
    return { closed: ids.length }
  }

  async function readSettings(context) {
    const names = [
      "disable-shortcuts", "shift-shortcuts", "disable-context-menus",
      "ignore-pinned-tabs", "externalBrowser1", "externalBrowser2"
    ]
    const entries = await Promise.all(names.map(async name => {
      const result = await requestWithFallback(context.client, "settings.get", { name })
      return [name, result && result.value || ""]
    }))
    const settings = Object.fromEntries(entries)
    await call(context.api.storage.local, "set", {
      [SETTINGS_CACHE_KEY]: settings,
      [SETTINGS_CACHED_AT_KEY]: Date.now()
    })
    return settings
  }

  // The cached copy when it is fresh enough, otherwise a refresh. A cache with
  // no timestamp (written by an earlier build) counts as stale.
  async function cachedSettings(context, maxAgeMs = SETTINGS_MAX_AGE_MS) {
    let stored = null
    try {
      stored = await call(context.api.storage.local, "get", [SETTINGS_CACHE_KEY, SETTINGS_CACHED_AT_KEY])
    } catch (_) {}
    const settings = stored && stored[SETTINGS_CACHE_KEY]
    const cachedAt = stored && stored[SETTINGS_CACHED_AT_KEY]
    if (settings && typeof cachedAt === "number" && Date.now() - cachedAt < maxAgeMs) return settings
    return readSettings(context)
  }

  // The dashboard's Settings page wrote a value: the next reader refreshes.
  async function invalidateSettings(api) {
    await call(api.storage.local, "remove", [SETTINGS_CACHED_AT_KEY]).catch(() => {})
  }

  async function performCommand(command, data, context) {
    const { api, controller, client } = context
    const tabs = await call(api.tabs, "query", { currentWindow: true })
    const active = tabs.find(tab => tab.active) || tabs[0]
    switch (command) {
      case "DuplicateTab":
        if (active) await call(api.tabs, "duplicate", active.id)
        return { duplicated: !!active }
      case "GoToSpace": return controller.openDashboard()
      case "SaveTabs":
      case "SaveAllPagesToTabSpace":
        return controller.saveTabIds(tabs.map(tab => tab.id), {
          allWindowsIfEnabled: true,
          closeTabsAfterSave: true,
          openDashboardAfterSave: true,
          preserveActiveTab: true
        })
      case "SaveCurrentTab":
      case "SaveCurrentPageToTabSpace":
        return controller.saveTabIds(active ? [active.id] : [], {
          closeTabsAfterSave: false,
          openDashboardAfterSave: true
        })
      case "CloseRightTabs": return closeRelativeTabs(api, "right")
      case "CloseLeftTabs": return closeRelativeTabs(api, "left")
      case "CloseOtherTabs": return closeRelativeTabs(api, "other", await cachedSettings(context))
      case "CloseSameDomainTabs": return closeRelativeTabs(api, "domain")
      case "OpenInExternalBrowser1":
      case "OpenInExternalBrowser2": {
        if (!active || !active.url) return { opened: false }
        const setting = command.endsWith("1") ? "externalBrowser1" : "externalBrowser2"
        const fallback = command.endsWith("1") ? "Google Chrome" : "Microsoft Edge"
        const result = await requestWithFallback(client, "settings.get", { name: setting })
        return root.TabSpaceSafariNative.send({
          op: "system.openInBrowser",
          browser: result && result.value || fallback,
          url: active.url
        })
      }
      case "AddToNotes": {
        const note = `${data && data.content || ""} \n \n [Link](${data && data.url || ""})`
        const url = `bear://x-callback-url/create?text=${encodeURIComponent(note)}&tags=${encodeURIComponent("From Tab Space")}`
        return root.TabSpaceSafariNative.send({ op: "system.openURL", url })
      }
      default: throw Object.assign(new Error(`Unsupported Safari command: ${command}`), { code: "unsupported_command" })
    }
  }

  async function perform(chosen, context) {
    if (!chosen || typeof chosen.action !== "string") return null
    const started = Date.now()
    trace("perform", chosen.action)
    try {
      const result = await performChosen(chosen, context)
      const outcome = result && typeof result === "object"
        ? [
            Number.isInteger(result.savedCount) ? `saved=${result.savedCount}` : "",
            "closedTabs" in result ? `closed=${result.closedTabs}` : "",
            "openedDashboard" in result ? `dashboard=${result.openedDashboard}` : "",
            Array.isArray(result.postSaveErrors) && result.postSaveErrors.length
              ? `errors=${result.postSaveErrors.map(entry => `${entry.action}:${entry.error && entry.error.code}`).join(",")}`
              : ""
          ].filter(Boolean).join(" ")
        : ""
      trace("perform-done", `${chosen.action} ${Date.now() - started}ms ${outcome}`.trim())
      return result
    } catch (error) {
      trace("perform-failed", `${chosen.action} ${error && error.code} ${error && error.name} ${Date.now() - started}ms`)
      throw error
    }
  }

  async function performChosen(chosen, context) {
    const { api, controller, client, sessions, currentTabs } = context
    switch (chosen.action) {
      case "save":
        return controller.saveTabIds(currentTabs.map(tab => tab.id), {
          allWindowsIfEnabled: true,
          closeTabsAfterSave: chosen.closeTabs === true,
          openDashboardAfterSave: true,
          preserveActiveTab: true,
          destinationSessionUuid: chosen.sessionUuid || ""
        })
      case "saveCurrent": {
        const active = currentTabs.find(tab => tab.active) || currentTabs[0]
        return controller.saveTabIds(active ? [active.id] : [], {
          closeTabsAfterSave: false,
          openDashboardAfterSave: true,
          destinationSessionUuid: chosen.sessionUuid || ""
        })
      }
      case "openSpace": return controller.openDashboard()
      case "restore": return restoreUrls(api, chosen.urls)
      case "deleteSession": {
        const session = sessionByUuid(sessions, chosen.sessionUuid)
        if (!session) throw Object.assign(new Error("The selected session no longer exists."), { code: "session_not_found" })
        return requestWithFallback(client, "sessions.delete", { sessions: [session] })
      }
      case "openSwitcher": return root.TabSpaceSafariNative.send({ op: "system.openSwitcher" })
      case "openMultiBrowserSetup": return root.TabSpaceSafariNative.send({ op: "system.openMultiBrowserSetup" })
      default: throw Object.assign(new Error(`Unsupported Safari menu action: ${chosen.action}`), { code: "unsupported_menu_action" })
    }
  }

  // Which save items the menu may enable: the same rule the App Extension's
  // popover applied, computed from the tabs the controller would actually
  // save. A tab whose URL Safari withholds (no website access, a start page)
  // just disables Save Current Tab — it never takes the native menu away.
  async function saveAvailability(controller) {
    if (!controller || typeof controller.listPopupTabs !== "function") {
      return { hasValidTabs: true, currentTabValid: true }
    }
    try {
      const savable = await controller.listPopupTabs()
      return {
        hasValidTabs: savable.length > 0,
        currentTabValid: savable.some(tab => tab.isCurrent)
      }
    } catch (_) {
      return { hasValidTabs: true, currentTabValid: true }
    }
  }

  // Only the slice the menu draws is requested; a host too old to know the
  // method still answers with the whole library.
  async function fetchMenuSessions(client) {
    let result
    try {
      result = await requestWithFallback(client, "sessions.listRecent", { limit: MENU_RECENT_LIMIT })
    } catch (error) {
      if (!error || error.code !== "unsupported_method") throw error
      result = await requestWithFallback(client, "sessions.list", {})
    }
    return result && Array.isArray(result.sessions) ? result.sessions : []
  }

  // The menu is worth showing even when the library cannot be read right now:
  // its save and dashboard items do not need it, and the session submenus come
  // up from the last slice this menu drew — or empty, the way the popover did
  // on a cold store.
  async function menuSessions(context) {
    const { api, client } = context
    const refresh = fetchMenuSessions(client).then(sessions => {
      call(api.storage.local, "set", { [MENU_SESSIONS_CACHE_KEY]: sessions }).catch(() => {})
      return sessions
    }, error => {
      console.warn("[safari-menu] sessions unavailable for the menu:", error)
      return null
    })
    const fresh = await Promise.race([
      refresh,
      new Promise(resolve => setTimeout(() => resolve(undefined), MENU_SESSIONS_DEADLINE_MS))
    ])
    if (Array.isArray(fresh)) return fresh
    let cached = null
    try {
      cached = await call(api.storage.local, "get", [MENU_SESSIONS_CACHE_KEY])
    } catch (_) {}
    const sessions = cached && cached[MENU_SESSIONS_CACHE_KEY]
    return Array.isArray(sessions) ? sessions : []
  }

  async function show(context, clickedTab, clickedAt = Date.now()) {
    const { api, client, controller } = context
    const [window, currentTabs, sessions, stored, availability] = await Promise.all([
      call(api.windows, "getCurrent", { populate: false }),
      call(api.tabs, "query", { currentWindow: true }),
      menuSessions(context),
      call(api.storage.local, "get", [MENU_INSET_KEY]),
      saveAvailability(controller)
    ])
    const response = await root.TabSpaceSafariNative.send({
      op: "ui.menu",
      window: currentWindowRect(window),
      inset: stored && stored[MENU_INSET_KEY],
      // The click itself and the moment its data was ready: the handler
      // declines a click that has gone stale and logs both latencies.
      clickedAt,
      sentAt: Date.now(),
      sessions,
      hasValidTabs: availability.hasValidTabs,
      currentTabValid: availability.currentTabValid
    }, { timeoutMs: MENU_TIMEOUT_MS })

    if (response && Number.isFinite(response.measuredInset)) {
      await call(api.storage.local, "set", { [MENU_INSET_KEY]: response.measuredInset })
    }
    if (!response || response.shown !== true) {
      const declined = response && response.error && ["menu_stale", "menu_busy"].includes(response.error.code)
      if (declined) {
        throw Object.assign(new Error(response.error.message || response.error.code), { code: response.error.code })
      }
      // The one case the HTML popup exists for: AppKit could not draw the
      // menu. The click handler switches the button over to the popup.
      throw Object.assign(new Error("Safari could not display the native Tab Space menu."), { code: "menu_not_shown" })
    }
    // NSMenu runs a native tracking loop for an arbitrary amount of time.
    // Safari can discard the background page's loopback socket during that
    // interval without delivering `onclose` to this JS context, leaving a
    // readyState=OPEN socket whose requests only fail at the 10 s timeout.
    // Recycle it after the menu closes so the selected command reconnects to
    // the Helper immediately and still uses the WS-first transport policy.
    if (client && typeof client.close === "function") client.close()
    recordMenu(client, "native").catch(() => {})
    const result = await perform(response.chosen, {
      ...context,
      sessions,
      currentTabs,
      clickedTab
    })
    return { shown: true, result }
  }

  function install(context) {
    const { api } = context
    probe(api).then(available => call(api.storage.local, "set", {
      "tabspace-safari-menu-last-result": available ? "menu_native" : "menu_fallback"
    })).catch(() => {})
    const settingsAtStartup = cachedSettings(context).catch(() => ({}))
    // The click being served, if any. `popUp` holds the native handler's
    // main thread until the menu closes, so a second click meanwhile would
    // only queue another menu behind it; it is the user closing this one.
    let menuInFlight = null
    if (api.action && api.action.onClicked) {
      api.action.onClicked.addListener(tab => {
        if (menuInFlight) return menuInFlight
        // Keep Safari's MV3 background context alive while the native NSMenu
        // tracks and while the selected action crosses the bridge. Without
        // returning this promise Safari may tear down the event immediately
        // after the listener returns, before `sendNativeMessage` resolves.
        menuInFlight = show(context, tab, Date.now()).then(() => call(api.storage.local, "set", {
          "tabspace-safari-menu-last-result": "menu_native"
        })).catch(async error => {
          if (isMenuDeclined(error)) return
          // Only a menu that never appeared hands the button to the HTML
          // popup. A command that failed after the menu closed keeps the
          // native menu for the next click; it is logged, not punished.
          if (!isMenuUnavailableError(error)) {
            console.warn("[safari-menu] menu action failed:", error)
            return
          }
          // A dead or replaced handler is asked again before the button is
          // taken away: the probe relaunches it, and only a handler that
          // answers "not available" (or none at all) gets the popup. The
          // probe sets the popup itself either way.
          if (!isMenuDrawFailure(error)) {
            if (await probe(api)) {
              console.warn("[safari-menu] native handler recovered after:", error)
              return
            }
          } else {
            await setPopup(api, FALLBACK_POPUP).catch(() => {})
          }
          await call(api.storage.local, "set", {
            "tabspace-safari-menu-last-result": "menu_fallback"
          }).catch(() => {})
        }).finally(() => { menuInFlight = null })
        return menuInFlight
      })
    }
    if (api.contextMenus) {
      call(api.contextMenus, "removeAll").catch(() => {}).then(async () => {
        const settings = await settingsAtStartup
        if (settings["disable-context-menus"] === "true") return
        await call(api.contextMenus, "create", { id: "SaveCurrentPageToTabSpace", title: "Save Current Page", contexts: ["page"] })
        await call(api.contextMenus, "create", { id: "SaveAllPagesToTabSpace", title: "Save All Pages", contexts: ["page"] })
      }).catch(() => {})
      if (api.contextMenus.onClicked) {
        api.contextMenus.onClicked.addListener(info => {
          if (["SaveCurrentPageToTabSpace", "SaveAllPagesToTabSpace"].includes(info.menuItemId)) {
            performCommand(info.menuItemId, {}, context).catch(() => {})
          }
        })
      }
    }
    if (api.webNavigation && api.webNavigation.onBeforeNavigate) {
      api.webNavigation.onBeforeNavigate.addListener(details => {
        if (details.frameId !== 0) return
        let url
        try { url = new URL(details.url) } catch (_) { return }
        const redirect = (REDIRECT_HOSTS.has(url.host) && url.pathname === "/redirect.html") ||
          (REDIRECT_GITHUB_HOSTS.has(url.host) && url.pathname === "/Tab-Space/redirect.html") ||
          details.url === "http://tabspace/"
        if (redirect) call(api.tabs, "update", details.tabId, {
          url: "https://app.mytab.space"
        }).catch(() => {})
      })
    }
  }

  return {
    FALLBACK_POPUP,
    MENU_INSET_KEY,
    MENU_RECENT_LIMIT,
    MENU_SESSIONS_CACHE_KEY,
    MENU_SESSIONS_DEADLINE_MS,
    menuSessions,
    SETTINGS_CACHE_KEY,
    SETTINGS_CACHED_AT_KEY,
    SETTINGS_MAX_AGE_MS,
    cachedSettings,
    closeRelativeTabs,
    commandClient,
    invalidateSettings,
    isMenuDeclined,
    isMenuDrawFailure,
    isMenuUnavailableError,
    isTransportError,
    perform,
    performCommand,
    probe,
    requestWithFallback,
    restoreUrls,
    recordMenu,
    readSettings,
    show,
    install
  }
})
