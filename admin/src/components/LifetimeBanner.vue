<template>
  <transition name="lifetime-banner">
    <div v-if="visible" class="lifetime-banner" role="region" :aria-label="lang.lifetimeBannerText" data-testid="lifetime-banner">
      <span class="lifetime-banner-icon" aria-hidden="true">
        <v-icon name="star"></v-icon>
      </span>
      <span class="lifetime-banner-text">{{ lang.lifetimeBannerText || 'Tab Space Pro is now a one-time purchase: pay once, keep it for good.' }}</span>
      <span v-if="proLifetimeOnSale" class="lifetime-banner-badge" data-testid="lifetime-banner-sale">
        {{ lang.lifetimeSaleBadge || 'Limited time' }}
      </span>
      <a class="lifetime-banner-cta" href="#" data-testid="lifetime-banner-open" @click.prevent="open">
        {{ lang.viewPlans || 'View plans' }}
      </a>
      <button type="button" class="lifetime-banner-close" data-testid="lifetime-banner-close"
              :aria-label="lang.lifetimeBannerDismiss || 'Dismiss'" @click="dismiss">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
/**
 * One-time announcement of lifetime Pro for Free and Plus users.
 *
 * Most people never reopen the host app after an update, so its paywall alone
 * would leave them unaware of the new way to pay. The dashboard is where they
 * spend their time. Subscribers are left alone on purpose: the offer is not
 * pushed at people who already pay every year.
 *
 * Opening the plans or closing the banner settles it for good. The sale badge
 * shows only when the native app has judged the current price a sale, so the
 * banner never claims a limited time the App Store is not running.
 */
import { mapGetters, mapState } from 'vuex'
import { lifetimeBannerDismissedKey, readBannerFlag, writeBannerFlag } from '../banners'

export default {
  name: "LifetimeBanner",
  data() {
    return { dismissed: true }
  },
  computed: {
    ...mapState(["lang", "entitlementResolved", "entitlementTier", "proLifetimeOnSale"]),
    ...mapGetters(["lifetimeProOffered"]),
    visible() {
      return !this.dismissed
        && this.entitlementResolved
        && this.lifetimeProOffered
        && (this.entitlementTier === "free" || this.entitlementTier === "plus")
    }
  },
  mounted() {
    this.dismissed = readBannerFlag(lifetimeBannerDismissedKey) === "true"
  },
  methods: {
    open() {
      this.dismiss()
      this.$store.commit("setShowSubscriptionModal", { show: true, reason: "lifetimeIntro" })
    },
    dismiss() {
      this.dismissed = true
      writeBannerFlag(lifetimeBannerDismissedKey, "true")
    }
  }
}
</script>

<style scoped>
.lifetime-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 16px;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
}

.lifetime-banner-icon {
  display: flex;
  color: var(--primary-color);
}

.lifetime-banner-text {
  flex: 1;
  font-size: 14px;
}

.lifetime-banner-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background-color: var(--primary-color);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
}

.lifetime-banner-cta {
  padding: 6px 12px;
  border-radius: var(--radius-md);
  background-color: var(--primary-color);
  color: #fff;
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}

.lifetime-banner-cta:hover {
  background-color: var(--primary-color-hover);
}

.lifetime-banner-close {
  display: flex;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.lifetime-banner-enter-active,
.lifetime-banner-leave-active {
  transition: opacity 0.2s ease;
}

.lifetime-banner-enter,
.lifetime-banner-leave-to {
  opacity: 0;
}

@media (max-width: 600px) {
  .lifetime-banner {
    flex-wrap: wrap;
  }
}
</style>
