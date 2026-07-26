export const iosBannerDismissedKey = "tabspace-ios-banner-dismissed"
export const ratingBannerAnsweredKey = "tabspace-rating-banner-answered"
export const ratingBannerFirstSeenKey = "tabspace-rating-banner-first-seen"
export const ratingBannerSnoozedAtKey = "tabspace-rating-banner-snoozed-at"
export const ratingBannerSnoozeCountKey = "tabspace-rating-banner-snooze-count"

export function readBannerFlag(key) {
  try {
    return localStorage.getItem(key)
  } catch (e) {
    return null
  }
}

export function writeBannerFlag(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    // ignore storage failures; the banner state stays in memory for this session
  }
}
