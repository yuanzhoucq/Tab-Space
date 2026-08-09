const enabled = new URLSearchParams(window.location.search).has("perf")
const entries = []

let panel = null

function rounded(value) {
  return Math.round(value * 10) / 10
}

function formatDetail(detail) {
  const values = Object.entries(detail || {}).map(([key, value]) => `${key}=${value}`)
  return values.length ? ` ${values.join(" ")}` : ""
}

function renderPanel() {
  if (!enabled) return
  if (!document.body) {
    window.setTimeout(renderPanel, 0)
    return
  }
  if (!panel) {
    panel = document.createElement("pre")
    panel.id = "tabspace-perf-debug"
    panel.setAttribute("aria-live", "polite")
    Object.assign(panel.style, {
      position: "fixed",
      right: "8px",
      bottom: "8px",
      zIndex: "2147483647",
      boxSizing: "border-box",
      width: "min(560px, calc(100vw - 16px))",
      maxHeight: "45vh",
      margin: "0",
      padding: "10px 12px",
      overflow: "auto",
      border: "1px solid rgba(255,255,255,.25)",
      borderRadius: "8px",
      background: "rgba(20, 24, 32, .94)",
      color: "#d7f9e9",
      boxShadow: "0 8px 28px rgba(0,0,0,.28)",
      font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
      whiteSpace: "pre-wrap",
      pointerEvents: "none"
    })
    document.body.appendChild(panel)
  }
  panel.textContent = entries
    .map(entry => `${entry.at.toFixed(1).padStart(7)} ms  ${entry.name}${formatDetail(entry.detail)}`)
    .join("\n")
  panel.scrollTop = panel.scrollHeight
}

export function perfDebugEnabled() {
  return enabled
}

export function markPerf(name, detail = {}) {
  if (!enabled) return null
  const entry = {
    name,
    at: rounded(performance.now()),
    detail
  }
  entries.push(entry)
  try {
    performance.mark(`tabspace:${name}`)
  } catch (_) {
    // Older WebKit releases can reject duplicate or malformed mark names.
  }
  console.info(`[Tab Space Perf] ${entry.at}ms ${name}`, detail)
  renderPanel()
  window.dispatchEvent(new CustomEvent("tabspace:perf-update", { detail: entry }))
  return entry
}

export function markAfterPaint(name, detail) {
  if (!enabled) return
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      markPerf(name, typeof detail === "function" ? detail() : detail)
    })
  })
}

if (enabled) {
  window.__tabspacePerf = {
    enabled: true,
    entries,
    snapshot() {
      return entries.map(entry => ({ ...entry, detail: { ...entry.detail } }))
    }
  }
  markPerf("perf-debug-loaded", {
    controlled: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)
  })
}
