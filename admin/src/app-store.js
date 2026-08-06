const APP_STORE_LINK_US = 'https://apps.apple.com/us/app/tab-space-tab-saver/id6790127383?itscg=30200&itsct=apps_box_link&mttnsubad=6790127383'
const APP_STORE_LINK_CN = 'https://apps.apple.com/cn/app/tab-space-%E6%A0%87%E7%AD%BE%E9%A1%B5%E4%BF%9D%E5%AD%98/id6790127383?itscg=30200&itsct=apps_box_link&mttnsubad=6790127383'
const MAC_APP_STORE_REVIEW_LINK_US = 'https://apps.apple.com/app/tab-space/id1473726602?mt=12&action=write-review'
const MAC_APP_STORE_REVIEW_LINK_CN = 'https://apps.apple.com/cn/app/tab-space/id1473726602?mt=12&action=write-review'

export const supportEmail = 'support@mytab.space'

// App Analytics tokens for links handed out by this dashboard.
//
// Most of the dashboard's audience is on a Mac, where the iOS listing cannot be
// bought at all — those people end up searching the App Store on their phone
// instead, which reports as organic search and is indistinguishable from a
// stranger finding the app. Tagging our own links is the only way to tell the
// two apart.
//
// Both tokens come from the campaign link generated in App Store Connect
// (Acquisition → Campaigns); Apple attributes a download to the campaign only
// when the link carries the provider token together with a matching campaign
// token.
const PROVIDER_TOKEN = '120285779'
const CAMPAIGN_TOKEN = 'mac-dashboard'

/// Appends the provider and campaign tokens without disturbing the parameters
/// Apple's own link builder already put on these URLs.
function withCampaign(url, campaign) {
  if (!campaign) return url
  const tokens = [`ct=${encodeURIComponent(campaign)}`]
  if (PROVIDER_TOKEN) tokens.unshift(`pt=${encodeURIComponent(PROVIDER_TOKEN)}`)
  return `${url}${url.includes('?') ? '&' : '?'}${tokens.join('&')}`
}

export function mobileAppStoreUrl(language = '', campaign = CAMPAIGN_TOKEN) {
  const base = language.toLowerCase() === 'zh-cn' ? APP_STORE_LINK_CN : APP_STORE_LINK_US
  return withCampaign(base, campaign)
}

// The dashboard ships inside the Mac app, so ratings belong to the Mac App Store listing.
export function macAppStoreReviewUrl(language = '') {
  return language.toLowerCase() === 'zh-cn' ? MAC_APP_STORE_REVIEW_LINK_CN : MAC_APP_STORE_REVIEW_LINK_US
}
