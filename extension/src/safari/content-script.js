(function () {
  "use strict"

  if (window.top !== window) return

  const REDIRECT =
    (["mytab.space", "tabspacestatic.joyuer.cn"].includes(location.host) && location.pathname === "/redirect.html") ||
    (["joyuer.cn", "yuanzhoucq.github.io"].includes(location.host) && location.pathname === "/Tab-Space/redirect.html") ||
    location.href === "http://tabspace/"

  function send(command, data) {
    try {
      const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime
      const response = runtime.sendMessage({ type: "safari.command", command, data: data || {} })
      if (response && typeof response.catch === "function") response.catch(() => {})
    } catch (_) {}
  }

  if (REDIRECT) {
    try {
      const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime
      runtime.sendMessage({ type: "safari.redirect" })
    } catch (_) {}
  }

  let settings = {}
  try {
    const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime
    Promise.resolve(runtime.sendMessage({ type: "safari.settings" })).then(response => {
      settings = response && response.ok ? response.result || {} : response || {}
    }).catch(() => {})
  } catch (_) {}

  function copyMarkdown() {
    const value = `[${document.title}](${document.location.href})`
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(() => {})
      return
    }
    const area = document.createElement("textarea")
    area.value = value
    document.body.appendChild(area)
    area.select()
    document.execCommand("copy")
    area.remove()
  }

  document.addEventListener("keyup", event => {
    if (!event.ctrlKey || event.metaKey || event.altKey) return
    if (settings["disable-shortcuts"] === "true") return
    const requiresShift = settings["shift-shortcuts"] === "true"
    if (requiresShift !== event.shiftKey) return
    const data = { source: "shortcut", shiftKey: event.shiftKey }
    switch (event.key.toLowerCase()) {
      case "d": send("DuplicateTab", data); break
      case "t": send("GoToSpace", data); break
      case "；":
      case ";":
      case "：":
      case ":": send("SaveTabs", data); break
      case "s": send("SaveCurrentTab", data); break
      case "c": send("OpenInExternalBrowser1", data); break
      case "f": send("OpenInExternalBrowser2", data); break
      case "r": send("CloseRightTabs", data); break
      case "l": send("CloseLeftTabs", data); break
      case "k": send("CloseSameDomainTabs", data); break
      case "q": send("CloseOtherTabs", data); break
      case "m": copyMarkdown(); break
      case "b": {
        const selection = window.getSelection()
        const content = selection && selection.toString()
        if (content) send("AddToNotes", {
          ...data,
          url: selection.anchorNode && selection.anchorNode.baseURI || location.href,
          content
        })
        break
      }
      default: break
    }
  })
})()
