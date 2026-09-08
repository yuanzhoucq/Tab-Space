// Is the dashboard being viewed on the kind of device that can install the iOS
// app itself?
//
// The answer decides how the iOS app is offered. On a Mac the App Store shows
// the iPhone listing as incompatible and will not sell it, so the only working
// handoff is a QR code the customer scans with their phone. On a phone or iPad
// that same code would be pointing at the device already holding it, and a
// plain link is the right answer.
export function isHandheld() {
  if (typeof navigator === "undefined") return false
  // Trackpads report a touch point or none; touchscreens report several.
  if (navigator.maxTouchPoints > 1) return true
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "")
}

// Is this Safari, as opposed to a companion browser running the Tab Space
// WebExtension?
//
// The two reach the app by completely different routes — Safari through the
// extension's per-site permission, everyone else through a pairing code — so
// the "not connected" screen has to know which one the visitor is on. Every
// Chromium browser and Firefox's iOS build carry "Safari" in their user agent
// as well, hence the exclusions.
export function isSafari() {
  if (typeof navigator === "undefined") return false
  const agent = navigator.userAgent || ""
  if (!/Safari/i.test(agent)) return false
  return !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR\/|Android/i.test(agent)
}
