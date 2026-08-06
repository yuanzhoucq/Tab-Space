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
