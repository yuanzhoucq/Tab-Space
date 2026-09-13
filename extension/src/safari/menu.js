(function (root, factory) {
  const exported = factory(root)
  if (typeof module === "object" && module.exports) module.exports = exported
  else root.TabSpaceSafariMenu = exported
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict"

  const MENU_INSET_KEY = "tabspace-safari-menu-inset"
  const FALLBACK_POPUP = "popup.html"
  const MENU_TIMEOUT_MS = 24 * 60 * 60 * 1000
  const SETTINGS_CACHE_KEY = "tabspace-safari-settings-v1"
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
      "connection_timeout", "connection_closed", "request_timeout"
    ].includes(error.code)
  }

  async function nativeCommand(method, params) {
    return root.TabSpaceSafariNative.send({
      op: "bridge.command",
      command: method,
      params: params || {}
    })
  }

  async function requestWithFallback(client, method, params) {
    try {
      return await client.request(method, params || {})
    } catch (error) {
      if (!isTransportError(error)) throw error
      const response = await nativeCommand(method, params)
      if (response && response.error) {
        const bridged = new Error(response.error.message || response.error.code)
        bridged.code = response.error.code || "native_error"
        throw bridged
      }
      return response && response.result ? response.result : response
    }
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

  async function closeRelativeTabs(api, mode) {
    const tabs = await call(api.tabs, "query", { currentWindow: true })
    const active = tabs.find(tab => tab.active)
    if (!active) return { closed: 0 }
    let doomed = []
    if (mode === "right") doomed = tabs.filter(tab => tab.index > active.index)
    if (mode === "left") doomed = tabs.filter(tab => tab.index < active.index)
    if (mode === "other") doomed = tabs.filter(tab => tab.id !== active.id)
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
      "externalBrowser1", "externalBrowser2"
    ]
    const entries = await Promise.all(names.map(async name => {
      const result = await requestWithFallback(context.client, "settings.get", { name })
      return [name, result && result.value || ""]
    }))
    const settings = Object.fromEntries(entries)
    await call(context.api.storage.local, "set", { [SETTINGS_CACHE_KEY]: settings })
    return settings
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
      case "CloseOtherTabs": return closeRelativeTabs(api, "other")
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
      case "activateTab":
        if (Number.isInteger(chosen.windowId)) {
          await call(api.windows, "update", chosen.windowId, { state: "normal", focused: true })
        }
        await call(api.tabs, "update", chosen.tabId, { active: true })
        return { activated: true }
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

  async function show(context, clickedTab) {
    const { api, client } = context
    const [window, currentTabs, sessionResult, stored] = await Promise.all([
      call(api.windows, "getCurrent", { populate: false }),
      call(api.tabs, "query", { currentWindow: true }),
      requestWithFallback(client, "sessions.list", {}),
      call(api.storage.local, "get", [MENU_INSET_KEY])
    ])
    const sessions = sessionResult && Array.isArray(sessionResult.sessions) ? sessionResult.sessions : []
    const response = await root.TabSpaceSafariNative.send({
      op: "ui.menu",
      window: currentWindowRect(window),
      inset: stored && stored[MENU_INSET_KEY],
      sentAt: Date.now(),
      sessions,
      tabs: currentTabs
    }, { timeoutMs: MENU_TIMEOUT_MS })

    if (response && Number.isFinite(response.measuredInset)) {
      await call(api.storage.local, "set", { [MENU_INSET_KEY]: response.measuredInset })
    }
    if (!response || response.shown !== true) {
      await setPopup(api, FALLBACK_POPUP)
      return { shown: false, fallback: true }
    }
    // NSMenu runs a native tracking loop for an arbitrary amount of time.
    // Safari can discard the background page's loopback socket during that
    // interval without delivering `onclose` to this JS context, leaving a
    // readyState=OPEN socket whose requests only fail at the 10 s timeout.
    // Recycle it after the menu closes so the selected command reconnects to
    // the Helper immediately and still uses the WS-first transport policy.
    if (client && typeof client.close === "function") client.close()
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
    readSettings(context).catch(() => {})
    if (api.action && api.action.onClicked) {
      api.action.onClicked.addListener(tab => {
        // Keep Safari's MV3 background context alive while the native NSMenu
        // tracks and while the selected action crosses the bridge. Without
        // returning this promise Safari may tear down the event immediately
        // after the listener returns, before `sendNativeMessage` resolves.
        return show(context, tab).then(() => call(api.storage.local, "set", {
          "tabspace-safari-menu-last-result": "menu_native"
        })).catch(async () => {
          await setPopup(api, FALLBACK_POPUP).catch(() => {})
          await call(api.storage.local, "set", {
            "tabspace-safari-menu-last-result": "menu_fallback"
          }).catch(() => {})
        })
      })
    }
    if (api.contextMenus) {
      call(api.contextMenus, "removeAll").catch(() => {}).then(async () => {
        const settings = await readSettings(context).catch(() => ({}))
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
    SETTINGS_CACHE_KEY,
    commandClient,
    isTransportError,
    perform,
    performCommand,
    probe,
    requestWithFallback,
    restoreUrls,
    readSettings,
    show,
    install
  }
})
