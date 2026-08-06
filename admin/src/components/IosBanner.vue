<template>
  <transition name="ios-banner">
    <div v-if="visible" class="ios-banner" role="region" :aria-label="lang.iosBannerText" data-testid="ios-banner">
      <span class="ios-banner-icon" aria-hidden="true">
        <v-icon name="smartphone"></v-icon>
      </span>

      <span class="ios-banner-copy">
        <span class="ios-banner-text">{{lang.iosBannerText}}</span>
        <span v-if="showsQr" class="ios-banner-hint" data-testid="ios-banner-hint">{{lang.iosBannerScanHint}}</span>
      </span>

      <!-- On a Mac the iOS listing reports "not compatible with this device"
           and cannot be bought, so a link is a dead end. Scanning hands the
           page straight to the phone that can install it. -->
      <!-- The code itself renders to a canvas, so the destination is exposed
           here as well: it is what makes the link verifiable in tests and
           readable when debugging a scan that went somewhere unexpected. -->
      <span v-if="showsQr" class="ios-banner-qr" data-testid="ios-banner-qr" :data-url="appStoreUrl">
        <qrcode-vue :value="appStoreUrl"
                    :size="qrSize"
                    level="M"
                    background="#ffffff"
                    foreground="#000000"></qrcode-vue>
      </span>
      <a v-else
         class="ios-banner-cta"
         :href="appStoreUrl"
         target="_blank"
         rel="noopener noreferrer"
         data-testid="ios-banner-cta">{{lang.iosBannerCta}}</a>

      <button type="button" class="ios-banner-close" :aria-label="lang.iosBannerDismiss" @click="dismiss">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
import { mapState } from 'vuex'
import QrcodeVue from 'qrcode.vue'
import Constants from '../constants'
import { mobileAppStoreUrl } from '../app-store'
import { isHandheld } from '../device'
import { iosBannerDismissedKey, readBannerFlag, writeBannerFlag } from '../banners'

let dismissedInMemory = false

// Small enough to sit in a one-line banner, large enough that a phone camera
// locks on from normal sitting distance.
const QR_SIZE = 84

export default {
  name: "IosBanner",
  components: { QrcodeVue },
  data() {
    return {
      visible: false,
      qrSize: QR_SIZE,
      // Resolved once on mount rather than per render: the answer cannot
      // change without a reload, and touch detection is not free.
      showsQr: false
    }
  },
  computed: {
    ...mapState(["lang", "tabSpaceSettings", "iosBannerRequestCount"]),
    appStoreUrl() {
      const preferredLanguage = this.tabSpaceSettings[Constants.preferredLanguageKey] || navigator.language
      return mobileAppStoreUrl(preferredLanguage)
    }
  },
  watch: {
    // The navbar's iOS entry asks for the banner instead of opening a listing
    // the Mac App Store refuses to sell. Reopening also clears the stored
    // dismissal, since the user has just asked for it again.
    iosBannerRequestCount() {
      dismissedInMemory = false
      writeBannerFlag(iosBannerDismissedKey, "false")
      this.showsQr = !this.isHandheld()
      this.visible = true
    }
  },
  mounted() {
    if (dismissedInMemory) return
    this.showsQr = !this.isHandheld()
    this.visible = readBannerFlag(iosBannerDismissedKey) !== "true"
  },
  methods: {
    isHandheld,
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

.ios-banner-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.ios-banner-text {
  font-weight: 500;
}

.ios-banner-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* The white quiet zone is part of the code, not decoration: without it the
   gradient behind the banner bleeds into the finder patterns and scanning
   gets unreliable. */
.ios-banner-qr {
  flex-shrink: 0;
  display: flex;
  padding: 5px;
  background-color: #fff;
  border-radius: var(--radius-sm, 6px);
  line-height: 0;
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
  align-self: flex-start;
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

  .ios-banner-copy {
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
