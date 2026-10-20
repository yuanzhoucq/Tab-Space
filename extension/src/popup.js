(function () {
  "use strict"

  const extensionApi = typeof browser !== "undefined" ? browser : chrome
  const preferPromises = typeof browser !== "undefined"
  const preferenceKeys = {
    openDashboardAfterSave: "tabspace-open-dashboard-after-save",
    closeTabsAfterSave: "tabspace-close-tabs-after-save"
  }
  // build.mjs rewrites this line for the Safari package, as it rewrites
  // BUILD_TARGET in background.js. Safari pairs itself through its native
  // handler, saves for free and keeps working without the helper, so none of
  // the companion browsers' pairing or Pro rules apply to it.
  const POPUP_TARGET = "companion"
  const SAFARI = POPUP_TARGET === "safari"
  // How long the Safari popup waits on its background page. A healthy one
  // answers within about nine seconds even when it has to try both channels
  // and the native handler times out; a wedged one never answers, and the
  // popup used to spin on "Loading" for good.
  const SAFARI_REPLY_TIMEOUT_MS = 12000
  const SILENCE_REPORTED_KEY = "tabspace-bridge-silence-reported"
  const zh = navigator.language.toLowerCase().startsWith("zh")
  const strings = zh ? {
    ready: "访问资料库，或保存当前浏览器的标签页。",
    saveRequiresPro: "从此浏览器保存标签页需要 Pro。",
    upgradePro: "升级到 Pro",
    planUnavailable: "暂时无法读取套餐，仍可打开资料库。",
    loading: "正在读取打开的标签页…",
    save: "保存标签页",
    saveCount: count => `保存 ${count} 个标签页`,
    saveCurrent: "保存当前标签页",
    customizeTabs: (selected, total) => selected === total ? "选择标签页" : `选择标签页（${selected}/${total}）`,
    hideTabSelection: "收起标签页选择",
    openDashboard: "打开 Tab Space",
    saveTo: "保存到：",
    newSession: "新会话",
    existingSession: "已有会话",
    untitledSession: "未命名会话",
    tabSelection: "标签页选择",
    sessionOption: (title, count) => `${title} · ${count} 个标签页`,
    afterSaving: "保存后",
    openDashboardAfterSave: "打开 Tab Space 管理页",
    closeTabsAfterSave: "关闭已保存的标签页",
    selection: (selected, total) => `已选择 ${selected} / ${total}`,
    selectAll: "全选",
    deselectAll: "取消全选",
    saving: "正在保存…",
    empty: "当前窗口没有可保存的网页标签。",
    failed: "保存失败，请打开 Tab Space 后重试。",
    connectTitle: "连接这个浏览器",
    connectApprovalWait: "正在等待你在 Mac 上的 Tab Space 里点“允许”…",
    connectCodeHelp: "打开 Mac 上的 Tab Space，点击“多浏览器支持…”，把其中的六位配对码输入到这里。",
    connectDeclined: "Tab Space 没有批准这个浏览器。",
    connectNoResponse: "没有收到 Mac 的回应。",
    connectNotVisible: "这个 Mac 账户上的 Tab Space 没有回应。打开它后重试，或使用配对码。",
    connectUseCode: "没看到提示？改用配对码",
    connectHelperMissing: "Tab Space 似乎没有在运行。先打开它，然后重试。",
    connect: "连接",
    openApp: "打开 Tab Space App",
    connecting: "正在连接…",
    invalidCode: "请输入六位配对码。",
    successTitle: "已保存到 Tab Space",
    success: count => `${count} 个标签页已保存，并会通过 iCloud 同步。`,
    appendSuccess: count => `${count} 个标签页已追加到所选会话。`,
    sessionUnavailable: "所选会话已不存在或已移入回收站，请重新选择。",
    proRequired: "资料库可免费访问。从此浏览器保存标签页需要 Pro。请在 Mac 上打开 Tab Space 升级。",
    done: "完成",
    doneCloseSaved: "完成并关闭已保存标签页",
    closeFailed: "标签页已保存，但未能关闭，请手动关闭。",
    followUpFailed: "标签页已保存，但有一项保存后操作未能完成。",
    websiteAccessRequired: "请在 Safari 中允许 Tab Space 访问当前网站，然后重试。",
    unreachableTitle: "Tab Space 没有响应",
    unreachableHelp: "请先打开 Tab Space。如果已经打开还是这样，请退出 Safari（⌘Q）后重新打开。",
    retry: "重试"
  } : {
    ready: "Open your library or save tabs from this browser.",
    saveRequiresPro: "Saving tabs from this browser requires Pro.",
    upgradePro: "Upgrade to Pro",
    planUnavailable: "Could not check your plan. You can still open your library.",
    loading: "Loading open tabs…",
    save: "Save Tabs",
    saveCount: count => `Save ${count} Tab${count === 1 ? "" : "s"}`,
    saveCurrent: "Save Current Tab",
    customizeTabs: (selected, total) => selected === total ? "Choose Tabs" : `Choose Tabs (${selected}/${total})`,
    hideTabSelection: "Hide tab selection",
    openDashboard: "Open Tab Space",
    saveTo: "Save to",
    newSession: "New session",
    existingSession: "Existing session",
    untitledSession: "Untitled session",
    tabSelection: "Tab selection",
    sessionOption: (title, count) => `${title} · ${count} tab${count === 1 ? "" : "s"}`,
    afterSaving: "After saving",
    openDashboardAfterSave: "Open the Tab Space dashboard",
    closeTabsAfterSave: "Close the saved tabs",
    selection: (selected, total) => `${selected} of ${total} selected`,
    selectAll: "Select All",
    deselectAll: "Deselect All",
    saving: "Saving…",
    empty: "There are no web tabs to save in this window.",
    failed: "Could not save. Open Tab Space, then try again.",
    connectTitle: "Connect this browser",
    connectApprovalWait: "Waiting for you to allow this browser in Tab Space on your Mac.",
    connectCodeHelp: "Open Tab Space on your Mac, click Multi-Browser Support…, and enter the six-digit pairing code it shows.",
    connectDeclined: "Tab Space did not approve this browser.",
    connectNoResponse: "No answer came back from your Mac.",
    connectNotVisible: "Tab Space did not answer for this Mac account. Open it and try again, or use a pairing code.",
    connectUseCode: "No prompt? Use a pairing code",
    connectHelperMissing: "Tab Space does not seem to be running. Open it, then try again.",
    connect: "Connect",
    openApp: "Open Tab Space App",
    connecting: "Connecting…",
    invalidCode: "Enter the six-digit pairing code.",
    successTitle: "Saved to Tab Space",
    success: count => `${count} tab${count === 1 ? " is" : "s are"} saved and will sync through iCloud.`,
    appendSuccess: count => `${count} tab${count === 1 ? " was" : "s were"} added to the selected session.`,
    sessionUnavailable: "The selected session no longer exists or is in Trash. Choose another session.",
    proRequired: "Library access is included. Saving tabs from this browser requires Pro. Open Tab Space on your Mac to upgrade.",
    done: "Done",
    doneCloseSaved: "Done and Close Saved Tabs",
    closeFailed: "The tabs were saved, but could not be closed. Please close them manually.",
    followUpFailed: "The tabs were saved, but one selected after-save action could not be completed.",
    websiteAccessRequired: "Allow Tab Space access to this website in Safari, then try again.",
    unreachableTitle: "Tab Space isn't responding",
    unreachableHelp: "Open Tab Space first. If it is already open, quit Safari (⌘Q) and open it again.",
    retry: "Try Again"
  }

  for (const element of document.querySelectorAll("[data-i18n]")) {
    const value = strings[element.dataset.i18n]
    if (typeof value === "string") element.textContent = value
  }

  function send(message) {
    if (preferPromises) return extensionApi.runtime.sendMessage(message)
    return new Promise((resolve, reject) => {
      extensionApi.runtime.sendMessage(message, response => {
        const error = extensionApi.runtime.lastError
        if (error) reject(new Error(error.message))
        else resolve(response)
      })
    })
  }

  function storageGet(defaults) {
    if (preferPromises) return extensionApi.storage.local.get(defaults)
    return new Promise((resolve, reject) => {
      extensionApi.storage.local.get(defaults, values => {
        const error = extensionApi.runtime.lastError
        if (error) reject(new Error(error.message))
        else resolve(values)
      })
    })
  }

  function storageSet(values) {
    if (preferPromises) return extensionApi.storage.local.set(values)
    return new Promise((resolve, reject) => {
      extensionApi.storage.local.set(values, () => {
        const error = extensionApi.runtime.lastError
        if (error) reject(new Error(error.message))
        else resolve()
      })
    })
  }

  let hasPro = false
  let entitlementResolved = false

  const elements = {
    editor: document.getElementById("editor-view"),
    pairing: document.getElementById("pairing-view"),
    unreachable: document.getElementById("unreachable-view"),
    unreachableOpenApp: document.getElementById("unreachable-open-app"),
    unreachableRetry: document.getElementById("unreachable-retry"),
    success: document.getElementById("success-view"),
    save: document.getElementById("save"),
    proNote: document.getElementById("pro-note"),
    upgradePro: document.getElementById("upgrade-pro"),
    saveCurrent: document.getElementById("save-current"),
    openDashboard: document.getElementById("open-dashboard"),
    customizeTabs: document.getElementById("customize-tabs"),
    customizeTabsLabel: document.getElementById("customize-tabs-label"),
    destination: document.getElementById("save-destination"),
    openDashboardAfterSave: document.getElementById("open-dashboard-after-save"),
    closeTabsAfterSave: document.getElementById("close-tabs-after-save"),
    saveLabel: document.getElementById("save-label"),
    loading: document.getElementById("loading"),
    status: document.getElementById("status"),
    tabSection: document.getElementById("tab-section"),
    tabList: document.getElementById("tab-list"),
    selection: document.getElementById("selection-summary"),
    toggleAll: document.getElementById("toggle-all"),
    pairingWait: document.getElementById("pairing-wait"),
    usePairingCode: document.getElementById("use-pairing-code"),
    pairingManual: document.getElementById("pairing-manual"),
    pairingCode: document.getElementById("pairing-code"),
    pair: document.getElementById("pair"),
    launchApp: document.getElementById("launch-app"),
    pairingStatus: document.getElementById("pairing-status"),
    successMessage: document.getElementById("success-message"),
    done: document.getElementById("done"),
    doneClose: document.getElementById("done-close-saved"),
    successStatus: document.getElementById("success-status")
  }
  elements.tabSection.setAttribute("aria-label", strings.tabSelection)

  let tabs = []
  let savedTabIds = []

  function selectedTabs() { return tabs.filter(tab => tab.selected) }
  // Pro gates saving only from the companion browsers; Safari saves for free.
  function canSave() { return SAFARI || hasPro }
  function showsProLock() { return !SAFARI && entitlementResolved && !hasPro }
  function destinationSessionUuid() {
    return elements.destination.value.startsWith("session:")
      ? elements.destination.value.slice("session:".length)
      : ""
  }

  function updateSelection() {
    const selected = selectedTabs().length
    elements.selection.textContent = strings.selection(selected, tabs.length)
    elements.toggleAll.textContent = selected === tabs.length ? strings.deselectAll : strings.selectAll
    elements.customizeTabsLabel.textContent = elements.tabSection.hidden
      ? strings.customizeTabs(selected, tabs.length)
      : strings.hideTabSelection
    elements.saveLabel.textContent = strings.saveCount(selected)
    elements.save.disabled = !canSave() || selected === 0
    elements.saveCurrent.disabled = !canSave() || !tabs.some(tab => tab.isCurrent)
    for (const chip of document.querySelectorAll(".pro-chip")) {
      chip.hidden = !showsProLock()
    }
    elements.proNote.hidden = !showsProLock()
    elements.save.classList.toggle("pro-locked", showsProLock())
    elements.saveCurrent.classList.toggle("pro-locked", showsProLock())
  }

  function renderSessionOptions(sessions) {
    elements.destination.replaceChildren()
    const newSession = document.createElement("option")
    newSession.value = "new"
    newSession.textContent = strings.newSession
    elements.destination.append(newSession)
    if (sessions.length > 0) {
      const existingSessions = document.createElement("optgroup")
      existingSessions.label = strings.existingSession
      for (const session of sessions) {
        const option = document.createElement("option")
        option.value = `session:${session.uuid}`
        option.textContent = strings.sessionOption(session.title || strings.untitledSession, session.siteCount)
        existingSessions.append(option)
      }
      elements.destination.append(existingSessions)
    }
    updateSelection()
  }

  function renderTabs() {
    elements.tabList.replaceChildren()
    tabs.forEach((tab, index) => {
      const row = document.createElement("label")
      row.className = tab.isCurrent ? "tab-row current-tab" : "tab-row"
      const checkbox = document.createElement("input")
      checkbox.type = "checkbox"
      checkbox.checked = tab.selected
      checkbox.dataset.index = String(index)
      checkbox.setAttribute("aria-label", tab.title)
      const copy = document.createElement("span")
      copy.className = "tab-copy"
      const title = document.createElement("span")
      title.className = "tab-title"
      title.textContent = tab.title
      const url = document.createElement("span")
      url.className = "tab-url"
      url.textContent = tab.url
      copy.append(title, url)
      row.append(checkbox, copy)
      elements.tabList.append(row)
    })
    updateSelection()
  }

  // Shown while the Mac app is asking the person whether to allow this browser.
  // The request lives in the background page, so it survives this popup being
  // closed — clicking the app's prompt takes focus away from the browser, and
  // that closes the popup in Chrome and Edge.
  function showPairingWaiting() {
    elements.loading.hidden = true
    elements.editor.hidden = true
    elements.success.hidden = true
    elements.pairing.hidden = false
    elements.pairingWait.hidden = false
    elements.pairingManual.hidden = true
    elements.pairingStatus.textContent = ""
    elements.pairingStatus.className = ""
  }

  // Why the code is being asked for. The approval path has already been tried
  // by the time this runs, so the copy names what happened instead of
  // presenting the code as the only way in.
  function pairingReason(error) {
    const code = error && error.code
    if (code === "invalid_pairing_code") return strings.invalidCode
    if (code === "pairing_declined") return strings.connectDeclined
    // Every helper that answered belongs to a macOS session that is not on
    // screen — from this person's point of view, their Tab Space is not there.
    if (code === "pairing_not_visible") return strings.connectNotVisible
    if (["pairing_timeout", "request_timeout"].includes(code)) return strings.connectNoResponse
    if (code === "helper_unavailable") return strings.connectHelperMissing
    // An app that predates approval answers with `pairing_required`, which is
    // the plain first-run state and needs no explanation beyond the lede.
    if (["pairing_required", "authentication_failed", "pairing_superseded"].includes(code)) return ""
    return (error && error.message) || ""
  }

  function showPairing(error) {
    elements.loading.hidden = true
    elements.editor.hidden = true
    elements.success.hidden = true
    elements.pairing.hidden = false
    elements.pairingWait.hidden = true
    elements.pairingManual.hidden = false
    elements.pairingStatus.textContent = pairingReason(error)
    elements.pairingStatus.className = elements.pairingStatus.textContent ? "error" : ""
    elements.pairingCode.focus()
  }

  // The popup is where a Safari whose extension has wedged lands, and nothing
  // else can say so: the helper and the native handler are both reached
  // through the background page that stopped answering. Anonymous, once a day
  // for each kind, to the route the dashboard reports the same state to.
  function reportSafariSilence(kind) {
    const today = new Date().toISOString().slice(0, 10)
    const stamp = `${today}:popup-${kind}`
    try {
      const reported = (localStorage.getItem(SILENCE_REPORTED_KEY) || "").split(" ").filter(Boolean)
      if (reported.includes(stamp)) return
      localStorage.setItem(SILENCE_REPORTED_KEY,
        [...reported.filter(entry => entry.startsWith(`${today}:`)), stamp].join(" "))
    } catch (_) {}
    if (typeof navigator.sendBeacon !== "function") return
    let version = "unknown"
    try { version = extensionApi.runtime.getManifest().version || version } catch (_) {}
    const safariVersion = /Version\/(\d{1,3}(?:\.\d{1,3}){0,3})/.exec(navigator.userAgent || "")
    const body = JSON.stringify({
      eventID: crypto.randomUUID(),
      anonymousInstallID: null,
      appVersion: `extension ${version}`,
      platform: "macos",
      event: "safari_bridge_silent",
      properties: {
        source: "popup",
        browser: "safari",
        resultType: kind,
        safariVersion: safariVersion ? safariVersion[1] : null
      }
    })
    try {
      navigator.sendBeacon("https://tabspace-worker.mytab.space/diagnostics/product",
        new Blob([body], { type: "text/plain" }))
    } catch (_) {}
  }

  // Safari's failure screen. Its pairing is automatic, so a code could only
  // mislead, and the multi-browser panel the companion browsers' "Open Tab
  // Space App" leads to is about other browsers. What helps is the app
  // running and, when the extension itself has wedged, restarting Safari.
  // `kind` is "no_reply" when the background page never answered and
  // "unreachable" when it answered that neither channel works.
  function showUnreachable(kind) {
    elements.loading.hidden = true
    elements.editor.hidden = true
    elements.success.hidden = true
    elements.pairing.hidden = true
    elements.unreachable.hidden = false
    reportSafariSilence(kind)
  }

  function showSuccess(result) {
    savedTabIds = result.closedTabs ? [] : (result.tabIds || [])
    elements.editor.hidden = true
    elements.pairing.hidden = true
    elements.success.hidden = false
    elements.successMessage.textContent = result.appendedToExisting
      ? strings.appendSuccess(result.savedCount)
      : strings.success(result.savedCount)
    elements.doneClose.disabled = savedTabIds.length === 0
    elements.doneClose.hidden = result.closedTabs === true
    if (Array.isArray(result.postSaveErrors) && result.postSaveErrors.length > 0) {
      elements.successStatus.textContent = strings.followUpFailed
      elements.successStatus.className = "error"
    }
    elements.done.focus()
  }

  async function save(tabItems, allWindowsIfEnabled) {
    if (!canSave()) return
    elements.save.disabled = true
    elements.saveCurrent.disabled = true
    elements.status.textContent = strings.saving
    try {
      const response = await send({
        type: "popup.saveTabs",
        tabIds: tabItems.map(tab => tab.id),
        allWindowsIfEnabled: allWindowsIfEnabled === true,
        destinationSessionUuid: destinationSessionUuid(),
        openDashboardAfterSave: elements.openDashboardAfterSave.checked,
        closeTabsAfterSave: elements.closeTabsAfterSave.checked
      })
      if (!response || !response.ok) {
        // Keep the browser connected for library access; only this save needs Pro.
        if (response && response.error && response.error.code === "pro_required") {
          hasPro = false
          entitlementResolved = true
          updateSelection()
          throw new Error(strings.proRequired)
        }
        if (!SAFARI && response && response.error && ["pairing_required", "authentication_failed"].includes(response.error.code)) {
          showPairing(response.error)
          return
        }
        if (response && response.error && ["session_not_found", "session_in_trash"].includes(response.error.code)) {
          throw new Error(strings.sessionUnavailable)
        }
        throw new Error(response && response.error ? response.error.message : strings.failed)
      }
      showSuccess(response.result)
    } catch (error) {
      elements.status.textContent = error.message || strings.failed
      elements.status.className = "error"
      updateSelection()
    }
  }

  elements.tabList.addEventListener("change", event => {
    if (!(event.target instanceof HTMLInputElement)) return
    const index = Number(event.target.dataset.index)
    if (!tabs[index]) return
    tabs[index].selected = event.target.checked
    updateSelection()
  })
  elements.toggleAll.addEventListener("click", () => {
    const select = selectedTabs().length !== tabs.length
    tabs.forEach(tab => { tab.selected = select })
    renderTabs()
  })
  elements.customizeTabs.addEventListener("click", () => {
    elements.tabSection.hidden = !elements.tabSection.hidden
    elements.customizeTabs.setAttribute("aria-expanded", String(!elements.tabSection.hidden))
    updateSelection()
  })
  elements.destination.addEventListener("change", updateSelection)
  elements.save.addEventListener("click", () => save(selectedTabs(), selectedTabs().length === tabs.length))
  elements.saveCurrent.addEventListener("click", () => save(tabs.filter(tab => tab.isCurrent), false))
  elements.openDashboard.addEventListener("click", async () => {
    try {
      const response = await send({ type: "popup.openDashboard" })
      if (!response || !response.ok) throw new Error(response && response.error ? response.error.message : strings.failed)
      window.close()
    } catch (error) {
      elements.status.textContent = error.message
      elements.status.className = "error"
    }
  })
  function persistPreferences() {
    return storageSet({
      [preferenceKeys.openDashboardAfterSave]: elements.openDashboardAfterSave.checked,
      [preferenceKeys.closeTabsAfterSave]: elements.closeTabsAfterSave.checked
    })
  }
  elements.openDashboardAfterSave.addEventListener("change", () => persistPreferences().catch(() => {}))
  elements.closeTabsAfterSave.addEventListener("change", () => persistPreferences().catch(() => {}))
  if (elements.upgradePro) {
    elements.upgradePro.addEventListener("click", async () => {
      try {
        const response = await send({ type: "popup.openPaywall" })
        if (!response || !response.ok) {
          throw new Error(response && response.error ? response.error.message : strings.failed)
        }
        window.close()
      } catch (error) {
        elements.status.textContent = error.message || strings.failed
        elements.status.className = "error"
      }
    })
  }
  elements.launchApp.addEventListener("click", () => {
    extensionApi.tabs.create({ url: "tabspace://connect" })
  })
  // Any tabspace:// link other than connect raises the app's main window,
  // which also starts the helper if it is not running.
  elements.unreachableOpenApp.addEventListener("click", () => {
    extensionApi.tabs.create({ url: "tabspace://open" })
  })
  elements.unreachableRetry.addEventListener("click", () => window.location.reload())
  async function submitPairingCode() {
    const code = elements.pairingCode.value.trim()
    if (!/^\d{6}$/.test(code)) {
      elements.pairingStatus.textContent = strings.invalidCode
      elements.pairingStatus.className = "error"
      return
    }
    elements.pair.disabled = true
    elements.pairingStatus.textContent = strings.connecting
    elements.pairingStatus.className = ""
    try {
      const response = await send({ type: "popup.pair", code })
      if (!response || !response.ok) {
        throw new Error(pairingReason(response && response.error) || strings.failed)
      }
      window.location.reload()
    } catch (error) {
      elements.pairingStatus.textContent = error.message || strings.failed
      elements.pairingStatus.className = "error"
      elements.pair.disabled = false
    }
  }

  elements.pair.addEventListener("click", submitPairingCode)
  // The request keeps running in the background while the code is typed, so
  // allowing the browser on the Mac afterwards still connects it. Submitting a
  // code abandons the request instead of raising it on another account.
  elements.usePairingCode.addEventListener("click", () => {
    elements.pairingWait.hidden = true
    elements.pairingManual.hidden = false
    elements.pairingCode.focus()
  })
  // A six-digit field that cannot be submitted from the keyboard is a field
  // people retype. Copying the code from the app also brings spaces with it.
  elements.pairingCode.addEventListener("keydown", event => {
    if (event.key === "Enter") submitPairingCode()
  })
  elements.pairingCode.addEventListener("input", () => {
    const digits = elements.pairingCode.value.replace(/\D/g, "").slice(0, 6)
    if (digits !== elements.pairingCode.value) elements.pairingCode.value = digits
  })
  elements.done.addEventListener("click", () => window.close())
  elements.doneClose.addEventListener("click", async () => {
    elements.done.disabled = true
    elements.doneClose.disabled = true
    const response = await send({ type: "popup.closeTabs", tabIds: savedTabIds })
    if (response && response.ok) window.close()
    else {
      elements.successStatus.textContent = strings.closeFailed
      elements.successStatus.className = "error"
      elements.done.disabled = false
      elements.doneClose.disabled = false
    }
  })

  if (extensionApi.runtime.onMessage) {
    extensionApi.runtime.onMessage.addListener(payload => {
      if (!payload || typeof payload.type !== "string") return
      if (payload.type === "pairing-awaiting") showPairingWaiting()
      // The browser was approved, or authenticated on its own after the app
      // started. Re-run from the top rather than patching a half-built view.
      if (payload.type === "bridge-connected" && (!elements.pairing.hidden || !elements.unreachable.hidden)) {
        window.location.reload()
      }
    })
  }

  async function bootstrap() {
    if (SAFARI) send({ type: "safari.menuTelemetry" }).catch(() => {})
    const preferences = await storageGet({
      [preferenceKeys.openDashboardAfterSave]: false,
      [preferenceKeys.closeTabsAfterSave]: false
    }).catch(() => ({}))
    elements.openDashboardAfterSave.checked = preferences[preferenceKeys.openDashboardAfterSave] === true
    elements.closeTabsAfterSave.checked = preferences[preferenceKeys.closeTabsAfterSave] === true
    if (SAFARI) return bootstrapSafari()

    const connection = await send({ type: "popup.connect" })
    if (!connection || connection.ok !== true) {
      // The person typed a code here while the app was still asking; that
      // code's own result decides what this popup shows next.
      if (connection && connection.error && connection.error.code === "pairing_superseded"
        && !elements.pairing.hidden && !elements.pairingManual.hidden) return
      showPairing(connection && connection.error
        ? connection.error
        : { code: "bridge_unavailable", message: strings.failed })
      return
    }

    const capabilities = connection.result && Array.isArray(connection.result.capabilities)
      ? connection.result.capabilities
      : []
    const [response, sessionsResponse, subscriptionResponse] = await Promise.all([
      send({ type: "popup.listTabs" }),
      capabilities.includes("sessions.appendTo")
        ? send({ type: "popup.listSessions" })
        : Promise.resolve({ ok: true, result: [] }),
      send({ type: "popup.subscriptionStatus" }).catch(() => ({ ok: false }))
    ])
    entitlementResolved = Boolean(subscriptionResponse && subscriptionResponse.ok)
    const subscription = subscriptionResponse && subscriptionResponse.result
    hasPro = entitlementResolved && Boolean(subscription &&
      (subscription.tier === "pro" || (!subscription.tier && subscription.status === "active")))
    if (!entitlementResolved) {
      elements.status.textContent = strings.planUnavailable
    }
    showEditor(response, sessionsResponse)
  }

  // Resolves to null when the background page does not answer in time, which
  // in Safari means it has wedged.
  function sendWithinTimeout(message) {
    return Promise.race([
      send(message).catch(error => ({ ok: false, error: { code: "extension_error", message: error.message } })),
      new Promise(resolve => setTimeout(() => resolve(null), SAFARI_REPLY_TIMEOUT_MS))
    ])
  }

  // Without the helper a save still goes through the native handler, so a
  // connection the helper refused, or that no helper answered, is not the end
  // of this popup. Only silence from the background page is, or both of its
  // channels failing.
  async function bootstrapSafari() {
    const connection = await sendWithinTimeout({ type: "popup.connect" })
    if (!connection) return showUnreachable("no_reply")
    const [response, sessionsResponse] = await Promise.all([
      sendWithinTimeout({ type: "popup.listTabs" }),
      sendWithinTimeout({ type: "popup.listSessions" })
    ])
    if (!response || !sessionsResponse) return showUnreachable("no_reply")
    if (connection.ok !== true && sessionsResponse.ok !== true) return showUnreachable("unreachable")
    showEditor(response, sessionsResponse)
  }

  function showEditor(response, sessionsResponse) {
    updateSelection()
    elements.loading.hidden = true
    if (!response || !response.ok) {
      if (response && response.error && response.error.code === "website_access_required") {
        throw new Error(strings.websiteAccessRequired)
      }
      throw new Error(response && response.error ? response.error.message : strings.failed)
    }
    renderSessionOptions(sessionsResponse && sessionsResponse.ok && Array.isArray(sessionsResponse.result)
      ? sessionsResponse.result
      : [])
    tabs = (response.result || []).map(tab => ({ ...tab, selected: true }))
    if (tabs.length === 0) {
      elements.status.textContent = strings.empty
      return
    }
    elements.customizeTabs.disabled = false
    renderTabs()
  }

  bootstrap().catch(error => {
    elements.loading.hidden = true
    elements.status.textContent = error.message
    elements.status.className = "error"
  })
})()
