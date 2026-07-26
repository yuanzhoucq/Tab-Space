const APP_STORE_LINK_US = 'https://apps.apple.com/us/app/tab-space-tab-saver/id6790127383?itscg=30200&itsct=apps_box_link&mttnsubad=6790127383'
const APP_STORE_LINK_CN = 'https://apps.apple.com/cn/app/tab-space-%E6%A0%87%E7%AD%BE%E9%A1%B5%E4%BF%9D%E5%AD%98/id6790127383?itscg=30200&itsct=apps_box_link&mttnsubad=6790127383'
const MAC_APP_STORE_REVIEW_LINK_US = 'https://apps.apple.com/app/tab-space/id1473726602?mt=12&action=write-review'
const MAC_APP_STORE_REVIEW_LINK_CN = 'https://apps.apple.com/cn/app/tab-space/id1473726602?mt=12&action=write-review'

export const supportEmail = 'support@mytab.space'

export function mobileAppStoreUrl(language = '') {
  return language.toLowerCase() === 'zh-cn' ? APP_STORE_LINK_CN : APP_STORE_LINK_US
}

// The dashboard ships inside the Mac app, so ratings belong to the Mac App Store listing.
export function macAppStoreReviewUrl(language = '') {
  return language.toLowerCase() === 'zh-cn' ? MAC_APP_STORE_REVIEW_LINK_CN : MAC_APP_STORE_REVIEW_LINK_US
}
