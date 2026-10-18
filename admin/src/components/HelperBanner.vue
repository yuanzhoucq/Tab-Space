<template>
  <transition name="helper-banner">
    <div v-if="visible" class="helper-banner" role="region" :aria-label="lang.helperBannerTitle" data-testid="helper-banner">
      <span class="helper-banner-icon" aria-hidden="true">
        <v-icon name="cloud-off"></v-icon>
      </span>

      <span class="helper-banner-copy">
        <span class="helper-banner-title">{{lang.helperBannerTitle}}</span>
        <span class="helper-banner-text">{{lang.helperBannerText}}</span>
      </span>

      <button type="button" class="helper-banner-cta" data-testid="helper-banner-open" @click="openApp">
        {{lang.helperBannerAction}}
      </button>

      <button type="button"
              class="helper-banner-close"
              data-testid="helper-banner-close"
              :aria-label="lang.helperBannerDismiss"
              @click="snooze">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
import { mapGetters, mapState } from 'vuex'
import {
  helperBannerSnoozeCountKey,
  helperBannerSnoozedAtKey,
  readBannerFlag,
  writeBannerFlag
} from '../banners'

// Without the background helper this Mac neither syncs with iCloud nor runs
// the tab switcher, and the Safari extension has to do all of its work through
// the slower fallback. Safari reports the helper's state; the banner asks for
// the one click that starts it. Closing it is "not now": a week of quiet, and
// after the third time only the note under the search field remains.
const SNOOZE_DAYS = 7
const MAX_SNOOZES = 3
const DAY_IN_MS = 24 * 60 * 60 * 1000
// The app starts the helper asynchronously; ask again while Safari stays in
// front, as well as when it regains focus.
const RECHECK_DELAYS_MS = [750, 1500, 3000, 5000]

let snoozedInMemory = false

export default {
  name: "HelperBanner",
  data() {
    return {
      snoozedAt: snoozedInMemory ? Date.now() : Number(readBannerFlag(helperBannerSnoozedAtKey)) || 0,
      snoozeCount: Number(readBannerFlag(helperBannerSnoozeCountKey)) || 0,
      recheckTimers: []
    }
  },
  computed: {
    ...mapState(["lang", "bridge"]),
    ...mapGetters(["switcherNeedsAppLaunch"]),
    visible() {
      if (!this.switcherNeedsAppLaunch) return false
      if (this.snoozeCount >= MAX_SNOOZES) return false
      return !(this.snoozedAt && Date.now() - this.snoozedAt < SNOOZE_DAYS * DAY_IN_MS)
    }
  },
  watch: {
    visible: {
      immediate: true,
      handler(shown) {
        this.$store.commit("setHelperBannerShown", shown)
      }
    }
  },
  beforeDestroy() {
    this.recheckTimers.forEach(clearTimeout)
    this.recheckTimers = []
    this.$store.commit("setHelperBannerShown", false)
  },
  methods: {
    openApp() {
      if (!this.bridge) return
      this.bridge.send({ cmd: "OpenTabSpaceApp" })
      this.recheckTimers.forEach(clearTimeout)
      this.recheckTimers = RECHECK_DELAYS_MS.map(delay => setTimeout(() => {
        if (this.bridge) this.bridge.send({ cmd: "CheckSwitcherHelperStatus" })
      }, delay))
    },
    snooze() {
      snoozedInMemory = true
      this.snoozedAt = Date.now()
      this.snoozeCount += 1
      writeBannerFlag(helperBannerSnoozedAtKey, String(this.snoozedAt))
      writeBannerFlag(helperBannerSnoozeCountKey, String(this.snoozeCount))
    }
  }
}
</script>

<style scoped>
.helper-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  box-sizing: border-box;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.helper-banner-icon {
  display: flex;
  align-items: center;
  color: var(--primary-color);
}

.helper-banner-icon .icon {
  width: 20px;
}

.helper-banner-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.helper-banner-title {
  font-weight: 500;
}

.helper-banner-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.helper-banner-cta {
  flex-shrink: 0;
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-md);
  background-color: var(--primary-color);
  color: #fff;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.helper-banner-cta:hover {
  background-color: var(--primary-color-hover);
}

.helper-banner-close {
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

.helper-banner-close .icon {
  width: 16px;
}

.helper-banner-enter-active,
.helper-banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.helper-banner-enter,
.helper-banner-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 700px) {
  .helper-banner {
    flex-wrap: wrap;
  }

  .helper-banner-copy {
    flex-basis: calc(100% - 32px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .helper-banner-enter-active,
  .helper-banner-leave-active {
    transition: none;
  }
}
</style>
