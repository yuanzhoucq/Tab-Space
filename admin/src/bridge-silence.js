import config from './config'
import buildInfo from './build-info'

// Safari's extension can wedge with its background page alive but deaf: the
// content script still injects the dashboard bridge, no request is ever
// answered, and only quitting and reopening Safari brings it back. Nothing on
// the native side can report that, because both of its channels run through
// the wedged page, so the dashboard reports it itself — straight to the
// Worker's anonymous product diagnostics, at most once a day for each kind.
const reportedKey = 'tabspace-bridge-silence-reported'
const endpoint = `${config.aiWorkerEndpoint}/diagnostics/product`

function utcDay() {
  return new Date().toISOString().slice(0, 10)
}

function safariVersion() {
  const match = /Version\/(\d{1,3}(?:\.\d{1,3}){0,3})/.exec(navigator.userAgent || '')
  return match ? match[1] : null
}

// The Worker accepts only RFC 4122 identifiers for an event.
function eventID() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function claimToday(kind) {
  const today = utcDay()
  const stamp = `${today}:${kind}`
  try {
    const reported = (localStorage.getItem(reportedKey) || '').split(' ').filter(Boolean)
    if (reported.includes(stamp)) return false
    const kept = reported.filter(entry => entry.startsWith(`${today}:`))
    localStorage.setItem(reportedKey, [...kept, stamp].join(' '))
  } catch (e) {
    // No storage: the caller's own once-per-page guard still applies.
  }
  return true
}

// `kind` is "no_reply" when the notice goes up and "recovered" when an answer
// finally arrives after it, which is what tells a wedge apart from a slow start.
// No install id travels with it: the bridge that knows it is the part that is
// stuck, and an invented one would count as a new install on the board.
export function reportBridgeSilence(kind, elapsedMs) {
  if (typeof navigator.sendBeacon !== 'function' || !claimToday(kind)) return false
  const body = JSON.stringify({
    eventID: eventID(),
    anonymousInstallID: null,
    appVersion: `dashboard ${buildInfo.shortSha}`,
    platform: 'macos',
    event: 'safari_bridge_silent',
    properties: {
      source: 'dashboard',
      browser: 'safari',
      resultType: kind,
      dashboardRenderMs: Math.min(60000, Math.max(0, Math.round(elapsedMs))),
      safariVersion: safariVersion()
    }
  })
  // text/plain keeps this a simple request: no preflight, which the Worker's
  // diagnostics routes do not answer, and the Worker parses the body anyway.
  return navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))
}
