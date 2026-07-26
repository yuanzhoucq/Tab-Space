<template>
  <transition name="ios-banner">
    <div v-if="visible" class="ios-banner" role="region" :aria-label="lang.iosBannerText" data-testid="ios-banner">
      <span class="ios-banner-icon" aria-hidden="true">
        <v-icon name="smartphone"></v-icon>
      </span>
      <span class="ios-banner-text">{{lang.iosBannerText}}</span>
      <a class="ios-banner-cta"
         :href="appStoreUrl"
         target="_blank"
         rel="noopener noreferrer">{{lang.iosBannerCta}}</a>
      <button type="button" class="ios-banner-close" :aria-label="lang.iosBannerDismiss" @click="dismiss">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
import { mapState } from 'vuex'
import Constants from '../constants'
import { mobileAppStoreUrl } from '../app-store'
import { iosBannerDismissedKey, readBannerFlag, writeBannerFlag } from '../banners'

let dismissedInMemory = false

export default {
  name: "IosBanner",
  data() {
    return {
      visible: false
    }
  },
  computed: {
    ...mapState(["lang", "tabSpaceSettings"]),
    appStoreUrl() {
      const preferredLanguage = this.tabSpaceSettings[Constants.preferredLanguageKey] || navigator.language
      return mobileAppStoreUrl(preferredLanguage)
    }
  },
  mounted() {
    if (dismissedInMemory) return
    this.visible = readBannerFlag(iosBannerDismissedKey) !== "true"
  },
  methods: {
    dismiss() {
      dismissedInMemory = true
      this.visible = false
      writeBannerFlag(iosBannerDismissedKey, "true")
    }
  }
}
</script>

<style scoped>
.ios-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  box-sizing: border-box;
  background-image: linear-gradient(135deg, rgba(250, 128, 114, 0.16), rgba(250, 128, 114, 0.06));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.ios-banner-icon {
  display: flex;
  align-items: center;
  color: var(--primary-color);
}

.ios-banner-icon .icon {
  width: 20px;
}

.ios-banner-text {
  font-weight: 500;
  flex: 1;
  min-width: 0;
}

.ios-banner-cta {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  background-color: var(--primary-color);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.ios-banner-cta:hover {
  background-color: var(--primary-color-hover);
}

.ios-banner-close {
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.ios-banner-close .icon {
  width: 16px;
}

.ios-banner-enter-active,
.ios-banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ios-banner-enter,
.ios-banner-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 700px) {
  .ios-banner {
    flex-wrap: wrap;
  }

  .ios-banner-text {
    flex-basis: calc(100% - 32px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ios-banner-enter-active,
  .ios-banner-leave-active {
    transition: none;
  }
}
</style>
