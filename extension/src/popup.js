(function () {
  "use strict"

  const extensionApi = typeof browser !== "undefined" ? browser : chrome
  const preferPromises = typeof browser !== "undefined"
  const preferenceKeys = {
    openDashboardAfterSave: "tabspace-open-dashboard-after-save",
    closeTabsAfterSave: "tabspace-close-tabs-after-save"
  }
  const zh = navigator.language.toLowerCase().startsWith("zh")
  const strings = zh ? {
    ready: "选择要保存到同一个会话的标签页。",
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
    connectHelp: "打开 Mac 上的 Tab Space，在主界面点击“多浏览器支持”，再点击“显示配对码”，然后输入六位数字。",
    connect: "连接",
    openApp: "打开 Tab Space App",
    connecting: "正在连接…",
    invalidCode: "请输入六位配对码。",
    successTitle: "已保存到 Tab Space",
    success: count => `${count} 个标签页已保存，并会通过 iCloud 同步。`,
    appendSuccess: count => `${count} 个标签页已追加到所选会话。`,
    sessionUnavailable: "所选会话已不存在或已移入回收站，请重新选择。",
    done: "完成",
    doneCloseSaved: "完成并关闭已保存标签页",
    closeFailed: "标签页已保存，但未能关闭，请手动关闭。",
    followUpFailed: "标签页已保存，但有一项保存后操作未能完成。"
  } : {
    ready: "Choose the tabs to save as one session.",
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
    connectHelp: "Open Tab Space on your Mac, click Multi-Browser Support in the main window, choose Show Pairing Code, then enter the six-digit code.",
    connect: "Connect",
    openApp: "Open Tab Space App",
    connecting: "Connecting…",
    invalidCode: "Enter the six-digit pairing code.",
    successTitle: "Saved to Tab Space",
    success: count => `${count} tab${count === 1 ? " is" : "s are"} saved and will sync through iCloud.`,
    appendSuccess: count => `${count} tab${count === 1 ? " was" : "s were"} added to the selected session.`,
    sessionUnavailable: "The selected session no longer exists or is in Trash. Choose another session.",
    done: "Done",
    doneCloseSaved: "Done and Close Saved Tabs",
    closeFailed: "The tabs were saved, but could not be closed. Please close them manually.",
    followUpFailed: "The tabs were saved, but one selected after-save action could not be completed."
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

  const elements = {
    editor: document.getElementById("editor-view"),
    pairing: document.getElementById("pairing-view"),
    success: document.getElementById("success-view"),
    save: document.getElementById("save"),
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
    elements.save.disabled = selected === 0
    elements.saveCurrent.disabled = !tabs.some(tab => tab.isCurrent)
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

  function showPairing(error) {
    elements.editor.hidden = true
    elements.success.hidden = true
    elements.pairing.hidden = false
    elements.pairingStatus.textContent = error && error.code === "invalid_pairing_code"
      ? strings.invalidCode
      : (error && !["pairing_required", "authentication_failed"].includes(error.code) ? error.message : "")
    elements.pairingStatus.className = elements.pairingStatus.textContent ? "error" : ""
    elements.pairingCode.focus()
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
        if (response && response.error && ["pairing_required", "authentication_failed"].includes(response.error.code)) {
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
    await send({ type: "popup.openDashboard" })
    window.close()
  })
  function persistPreferences() {
    return storageSet({
      [preferenceKeys.openDashboardAfterSave]: elements.openDashboardAfterSave.checked,
      [preferenceKeys.closeTabsAfterSave]: elements.closeTabsAfterSave.checked
    })
  }
  elements.openDashboardAfterSave.addEventListener("change", () => persistPreferences().catch(() => {}))
  elements.closeTabsAfterSave.addEventListener("change", () => persistPreferences().catch(() => {}))
  elements.launchApp.addEventListener("click", () => {
    extensionApi.tabs.create({ url: "tabspace://connect" })
  })
  elements.pair.addEventListener("click", async () => {
    const code = elements.pairingCode.value.trim()
    if (!/^\d{6}$/.test(code)) {
      elements.pairingStatus.textContent = strings.invalidCode
      elements.pairingStatus.className = "error"
      return
    }
    elements.pair.disabled = true
    elements.pairingStatus.textContent = strings.connecting
    try {
      const response = await send({ type: "popup.pair", code })
      if (!response || !response.ok) throw new Error(response && response.error ? response.error.message : strings.failed)
      window.location.reload()
    } catch (error) {
      elements.pairingStatus.textContent = error.message
      elements.pairingStatus.className = "error"
      elements.pair.disabled = false
    }
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

  async function bootstrap() {
    const preferences = await storageGet({
      [preferenceKeys.openDashboardAfterSave]: false,
      [preferenceKeys.closeTabsAfterSave]: false
    }).catch(() => ({}))
    elements.openDashboardAfterSave.checked = preferences[preferenceKeys.openDashboardAfterSave] === true
    elements.closeTabsAfterSave.checked = preferences[preferenceKeys.closeTabsAfterSave] === true

    const connection = await send({ type: "popup.connect" })
    if (!connection || connection.ok !== true) {
      showPairing(connection && connection.error
        ? connection.error
        : { code: "bridge_unavailable", message: strings.failed })
      return
    }

    const capabilities = connection.result && Array.isArray(connection.result.capabilities)
      ? connection.result.capabilities
      : []
    const [response, sessionsResponse] = await Promise.all([
      send({ type: "popup.listTabs" }),
      capabilities.includes("sessions.appendTo")
        ? send({ type: "popup.listSessions" })
        : Promise.resolve({ ok: true, result: [] })
    ])
    elements.loading.hidden = true
    if (!response || !response.ok) throw new Error(response && response.error ? response.error.message : strings.failed)
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
