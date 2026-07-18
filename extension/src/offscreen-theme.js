(function () {
  "use strict"

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)")

  function reportColorScheme() {
    chrome.runtime.sendMessage({
      type: "ui.colorScheme",
      colorScheme: colorScheme.matches ? "dark" : "light"
    }).catch(() => {})
  }

  colorScheme.addEventListener("change", reportColorScheme)
  reportColorScheme()
})()
