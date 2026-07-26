<template>
  <transition name="rating-banner">
    <div v-if="visible" class="rating-banner" role="region" :aria-label="lang.ratingBannerText" data-testid="rating-banner">
      <span class="rating-banner-icon" aria-hidden="true">
        <v-icon name="star"></v-icon>
      </span>
      <span class="rating-banner-text">{{lang.ratingBannerText}}</span>
      <a class="rating-banner-cta"
         data-testid="rating-banner-rate"
         :href="reviewUrl"
         target="_blank"
         rel="noopener noreferrer"
         @click="answer">{{lang.ratingBannerPositive}}</a>
      <a class="rating-banner-secondary"
         data-testid="rating-banner-feedback"
         :href="feedbackUrl"
         @click="answer">{{lang.ratingBannerNegative}}</a>
      <button type="button" class="rating-banner-close" :aria-label="lang.ratingBannerDismiss" @click="snooze">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
import { mapState } from 'vuex'
import BuildInfo from '../build-info'
import Constants from '../constants'
import { macAppStoreReviewUrl, supportEmail } from '../app-store'
import {
  iosBannerDismissedKey,
  ratingBannerAnsweredKey,
  ratingBannerFirstSeenKey,
  ratingBannerSnoozeCountKey,
  ratingBannerSnoozedAtKey,
  readBannerFlag,
  writeBannerFlag
} from '../banners'

// Only ask people who already got some value out of the app.
const MIN_SESSIONS = 3
const MIN_DAYS_IN_USE = 3
// Closing the banner buys a long quiet period, and we never ask more than twice.
const SNOOZE_DAYS = 90
const MAX_ASKS = 2
const DAY_IN_MS = 24 * 60 * 60 * 1000

let answeredInMemory = false
let snoozedInMemory = false

export default {
  name: "RatingBanner",
  data() {
    return {
      answered: false,
      firstSeenAt: 0,
      iosBannerDismissed: false,
      snoozedAt: 0,
      snoozeCount: 0
    }
  },
  computed: {
    ...mapState(["lang", "sessions", "tabSpaceSettings"]),
    preferredLanguage() {
      return this.tabSpaceSettings[Constants.preferredLanguageKey] || navigator.language
    },
    visible() {
      if (this.answered || !this.firstSeenAt) return false
      // The iOS banner owns this slot first; never stack two banners.
      if (!this.iosBannerDismissed) return false
      if (this.sessions.length < MIN_SESSIONS) return false
      if (this.snoozedAt && Date.now() - this.snoozedAt < SNOOZE_DAYS * DAY_IN_MS) return false
      return Date.now() - this.firstSeenAt >= MIN_DAYS_IN_USE * DAY_IN_MS
    },
    reviewUrl() {
      return macAppStoreReviewUrl(this.preferredLanguage)
    },
    feedbackUrl() {
      const subject = encodeURIComponent(this.lang.ratingBannerFeedbackSubject)
      const body = encodeURIComponent(`\n\n---\nTab Space dashboard ${BuildInfo.shortSha}`)
      return `mailto:${supportEmail}?subject=${subject}&body=${body}`
    }
  },
  mounted() {
    this.snoozeCount = Number(readBannerFlag(ratingBannerSnoozeCountKey)) || 0
    this.answered = answeredInMemory
      || readBannerFlag(ratingBannerAnsweredKey) === "true"
      || this.snoozeCount >= MAX_ASKS
    if (this.answered) return

    this.iosBannerDismissed = readBannerFlag(iosBannerDismissedKey) === "true"
    this.snoozedAt = snoozedInMemory ? Date.now() : Number(readBannerFlag(ratingBannerSnoozedAtKey)) || 0

    const storedFirstSeen = Number(readBannerFlag(ratingBannerFirstSeenKey))
    if (storedFirstSeen > 0) {
      this.firstSeenAt = storedFirstSeen
    } else {
      this.firstSeenAt = Date.now()
      writeBannerFlag(ratingBannerFirstSeenKey, String(this.firstSeenAt))
    }
  },
  methods: {
    // Rating or sending feedback settles the question for good.
    answer() {
      answeredInMemory = true
      this.answered = true
      writeBannerFlag(ratingBannerAnsweredKey, "true")
    },
    // Closing means "not now": ask once more after the snooze, then never again.
    snooze() {
      snoozedInMemory = true
      this.snoozedAt = Date.now()
      this.snoozeCount += 1
      writeBannerFlag(ratingBannerSnoozedAtKey, String(this.snoozedAt))
      writeBannerFlag(ratingBannerSnoozeCountKey, String(this.snoozeCount))
      if (this.snoozeCount >= MAX_ASKS) this.answer()
    }
  }
}
</script>

<style scoped>
.rating-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  box-sizing: border-box;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.rating-banner-icon {
  display: flex;
  align-items: center;
  color: var(--primary-color);
}

.rating-banner-icon .icon {
  width: 20px;
}

.rating-banner-text {
  font-weight: 500;
  flex: 1;
  min-width: 0;
}

.rating-banner-cta,
.rating-banner-secondary {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.rating-banner-cta {
  background-color: var(--primary-color);
  color: #fff;
}

.rating-banner-cta:hover {
  background-color: var(--primary-color-hover);
}

.rating-banner-secondary {
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.rating-banner-secondary:hover {
  border-color: var(--primary-color);
  color: var(--text-primary);
}

.rating-banner-close {
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.rating-banner-close .icon {
  width: 16px;
}

.rating-banner-enter-active,
.rating-banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.rating-banner-enter,
.rating-banner-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 700px) {
  .rating-banner {
    flex-wrap: wrap;
  }

  .rating-banner-text {
    flex-basis: calc(100% - 32px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rating-banner-enter-active,
  .rating-banner-leave-active {
    transition: none;
  }
}
</style>
