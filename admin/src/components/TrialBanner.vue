<template>
  <transition name="trial-banner">
    <div v-if="visible"
         class="trial-banner"
         :class="{ 'is-ending': ending }"
         role="region"
         :aria-label="message"
         data-testid="trial-banner">
      <span class="trial-banner-icon" aria-hidden="true">
        <v-icon name="gift"></v-icon>
      </span>

      <span class="trial-banner-copy">
        <span class="trial-banner-title">{{ lang.trialBannerTitle || '7 days of Pro, on us' }}</span>
        <span class="trial-banner-text" data-testid="trial-banner-text">{{ message }}</span>
      </span>

      <button type="button"
              class="trial-banner-cta"
              data-testid="trial-banner-cta"
              @click="openPlans">{{ lang.trialBannerCta || 'See plans' }}</button>

      <button type="button"
              class="trial-banner-close"
              :aria-label="lang.trialBannerDismiss || 'Dismiss'"
              @click="dismiss">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
  import { mapGetters, mapState } from 'vuex'
  import { readBannerFlag, trialBannerDismissedKey, writeBannerFlag } from '../banners'

  // The last stretch is the one that has to reach the user, so a dismissal made
  // on day one does not silence the reminder that the trial is about to end.
  const ENDING_SOON_DAYS = 2

  // How long to wait for the native side to confirm the grant. A companion
  // browser extension that predates the trial drops the command silently, and a
  // banner promising seven days that never started is worse than no banner.
  const CLAIM_CONFIRM_TIMEOUT_MS = 4000

  let dismissedInMemory = false
  // The claim is idempotent natively; this only keeps the dashboard from
  // re-sending it every time a status reply re-lands during the same visit.
  let claimedInMemory = false

  export default {
    name: "TrialBanner",
    data() {
      return {
        dismissed: false,
        endingDismissed: false,
        claimUnconfirmed: false,
        claimTimer: null
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "trialExpiresAt"]),
      ...mapGetters(["canClaimTrial", "trialActive", "trialDaysRemaining"]),
      ending() {
        return this.trialActive && this.trialDaysRemaining <= ENDING_SOON_DAYS
      },
      visible() {
        // Eligible means the trial has not started yet: showing this banner is
        // what starts it, so it is never suppressed by an earlier dismissal.
        if (this.canClaimTrial) return !this.claimUnconfirmed
        if (!this.trialActive) return false
        return this.ending ? !this.endingDismissed : !this.dismissed
      },
      message() {
        const days = this.trialDaysRemaining
        const template = this.ending
          ? (this.lang.trialBannerEnding
            || 'Your Pro trial ends in {count} days. Everything you saved stays yours; saving more will need Pro.')
          : (this.lang.trialBannerRunning
            || '{count} days of Pro left — unlimited sessions, AI titles and tags, and Chrome, Edge and Firefox.')
        return template.replace("{count}", days)
      }
    },
    watch: {
      // The status reply can arrive after this component mounts, so eligibility
      // is watched rather than read once.
      canClaimTrial: {
        immediate: true,
        handler(eligible) {
          // Showing the banner is what starts the clock, so the claim goes out
          // here and nowhere else: the user is looking at the gift as it is
          // given. The native side re-checks eligibility before granting.
          if (!eligible || claimedInMemory || !this.bridge) return
          claimedInMemory = true
          this.bridge.send({ cmd: "ClaimFreeTrial" })
          this.claimTimer = setTimeout(() => {
            // Still eligible means the grant never landed. Stand down quietly
            // rather than keep advertising a trial nothing started.
            if (this.canClaimTrial) this.claimUnconfirmed = true
          }, CLAIM_CONFIRM_TIMEOUT_MS)
        }
      },
      visible: {
        immediate: true,
        handler(showing) {
          // IosBanner and RatingBanner stand down while this is on screen; two
          // stacked banners push the sessions off the fold.
          this.$store.commit("setTrialBannerVisible", showing)
        }
      }
    },
    mounted() {
      this.dismissed = dismissedInMemory || readBannerFlag(trialBannerDismissedKey) === "true"
    },
    beforeDestroy() {
      if (this.claimTimer) clearTimeout(this.claimTimer)
      this.$store.commit("setTrialBannerVisible", false)
    },
    methods: {
      openPlans() {
        this.$store.commit("setShowSubscriptionModal", { show: true, reason: "trialRunning" })
      },
      dismiss() {
        if (this.ending) {
          // The final reminder is dismissed for this session only; there is
          // nothing left to remind about once the trial is over.
          this.endingDismissed = true
          return
        }
        dismissedInMemory = true
        this.dismissed = true
        writeBannerFlag(trialBannerDismissedKey, "true")
      }
    }
  }
</script>

<style scoped>
  .trial-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 16px;
    box-sizing: border-box;
    background-color: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    margin-bottom: 12px;
  }

  .trial-banner.is-ending {
    border-color: var(--warning-color, #dd6b20);
  }

  .trial-banner-icon {
    display: flex;
    color: var(--primary-color, #4299e1);
  }

  .trial-banner-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .trial-banner-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .trial-banner-text {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .trial-banner-cta {
    background: none;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    color: var(--text-primary);
    cursor: pointer;
    white-space: nowrap;
  }

  .trial-banner-cta:hover {
    border-color: var(--primary-color, #4299e1);
  }

  .trial-banner-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
  }

  .trial-banner-enter-active,
  .trial-banner-leave-active {
    transition: opacity 0.2s ease;
  }

  .trial-banner-enter,
  .trial-banner-leave-to {
    opacity: 0;
  }
</style>
