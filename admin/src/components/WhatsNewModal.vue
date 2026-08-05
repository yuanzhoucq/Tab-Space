<template>
  <div v-if="visible" class="whats-new-overlay" @click.self="dismiss">
    <div class="whats-new-modal" role="dialog" aria-modal="true"
         aria-labelledby="whats-new-title" data-testid="whats-new-modal">
      <button type="button" class="whats-new-close"
              :aria-label="lang.whatsNewClose"
              data-testid="whats-new-close"
              @click="dismiss">
        <v-icon name="x"></v-icon>
      </button>

      <div class="modal-header">
        <span class="version-pill" aria-hidden="true">4.0</span>
        <h2 id="whats-new-title">{{ lang.whatsNewTitle }}</h2>
      </div>

      <div class="modal-content">
        <p class="lede">{{ lang.whatsNewLede }}</p>

        <ul class="highlights">
          <li>
            <v-icon name="award" class="highlight-icon"></v-icon>
            <div>
              <p class="highlight-title">{{ lang.whatsNewPlusTitle }}</p>
              <p class="highlight-detail">{{ lang.whatsNewPlusDetail }}</p>
            </div>
          </li>
          <li>
            <v-icon name="shield" class="highlight-icon"></v-icon>
            <div>
              <p class="highlight-title">{{ lang.whatsNewSessionsTitle }}</p>
              <p class="highlight-detail">{{ lang.whatsNewSessionsDetail }}</p>
            </div>
          </li>
          <li>
            <v-icon name="zap" class="highlight-icon"></v-icon>
            <div>
              <p class="highlight-title">{{ lang.whatsNewAiTitle }}</p>
              <p class="highlight-detail">{{ lang.whatsNewAiDetail }}</p>
            </div>
          </li>
          <li>
            <v-icon name="globe" class="highlight-icon"></v-icon>
            <div>
              <p class="highlight-title">{{ lang.whatsNewBrowsersTitle }}</p>
              <p class="highlight-detail">{{ lang.whatsNewBrowsersDetail }}</p>
            </div>
          </li>
        </ul>

        <p v-if="hasPermanentPlus" class="plus-grant" data-testid="whats-new-plus-grant">
          {{ lang.whatsNewPlusGrant }}
        </p>

        <div class="actions">
          <a class="changelog-link"
             href="https://mytab.space/changelog.html"
             target="_blank"
             rel="noopener noreferrer">{{ lang.whatsNewChangelog }}</a>
          <button type="button" class="primary-action" ref="dismissButton"
                  data-testid="whats-new-dismiss"
                  @click="dismiss">
            {{ lang.whatsNewDismiss }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * One-time introduction to Tab Space 4.0.
 *
 * It appears once per browser for people who already had sessions before the
 * release, then never again: the accepted version is written to local storage,
 * so bumping Constants.whatsNewVersion is all a later release needs.
 *
 * A brand-new install has nothing to catch up on, so the flag is written
 * silently instead — otherwise the first thing a first-run user sees is a
 * summary of changes they never experienced.
 *
 * Settings can reopen it at any time (whatsNewRequested), which is the only way
 * back once the release has been seen.
 */
import { mapGetters, mapState } from 'vuex'
import Constants from '../constants'
import { whatsNewSeenVersionKey, readBannerFlag, writeBannerFlag } from '../banners'

export default {
  name: 'WhatsNewModal',
  data() {
    return {
      armed: false,
      resolved: false
    }
  },
  computed: {
    ...mapState([
      'lang',
      'nativeDetected',
      'initialRefresh',
      'showAIConsentModal',
      'showSubscriptionModal',
      'showSuggestionReport',
      'splitPreview',
      'whatsNewRequested'
    ]),
    ...mapGetters(['hasPermanentPlus', 'savedSessionCount']),
    ready() {
      return this.nativeDetected && this.initialRefresh
    },
    // Whatever the user opened themselves comes first; this dialog waits its
    // turn rather than stacking on top of a consent or purchase prompt.
    otherModalOpen() {
      return this.showAIConsentModal
        || this.showSubscriptionModal
        || this.showSuggestionReport
        || Boolean(this.splitPreview)
    },
    visible() {
      return (this.armed || this.whatsNewRequested) && !this.otherModalOpen
    }
  },
  watch: {
    ready() {
      this.evaluate()
    },
    visible: {
      immediate: true,
      handler(shown) {
        if (shown) this.focusDismiss()
      }
    }
  },
  mounted() {
    document.addEventListener('keydown', this.onKeydown)
    this.evaluate()
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    evaluate() {
      if (this.resolved || !this.ready) return
      if (readBannerFlag(whatsNewSeenVersionKey) === Constants.whatsNewVersion) {
        this.resolved = true
        return
      }
      if (this.savedSessionCount < 1) {
        this.resolved = true
        writeBannerFlag(whatsNewSeenVersionKey, Constants.whatsNewVersion)
        return
      }
      this.armed = true
    },
    dismiss() {
      this.armed = false
      this.resolved = true
      if (this.whatsNewRequested) this.$store.commit('setWhatsNewRequested', false)
      writeBannerFlag(whatsNewSeenVersionKey, Constants.whatsNewVersion)
    },
    focusDismiss() {
      this.$nextTick(() => {
        if (this.$refs.dismissButton) this.$refs.dismissButton.focus()
      })
    },
    onKeydown(event) {
      if (event.key === 'Escape' && this.visible) this.dismiss()
    }
  }
}
</script>

<style scoped>
.whats-new-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1140;
  backdrop-filter: blur(4px);
}

.whats-new-modal {
  position: relative;
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #2d3748);
  border-radius: 16px;
  max-width: 520px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.whats-new-close {
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-secondary, #718096);
  display: flex;
  align-items: center;
}

.whats-new-close .icon {
  width: 18px;
}

.modal-header {
  padding: 22px 24px 16px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  background-image: linear-gradient(135deg, rgba(250, 128, 114, 0.16), rgba(250, 128, 114, 0.02));
  border-radius: 16px 16px 0 0;
}

.version-pill {
  display: inline-block;
  margin-bottom: 8px;
  padding: 2px 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fa8072, #eb5205);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.4;
}

.modal-header h2 {
  margin: 0;
  padding-right: 28px;
  font-size: 20px;
  font-weight: 700;
}

.modal-content {
  padding: 18px 24px 22px;
}

.lede {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.55;
}

.highlights {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}

.highlights li {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border-color, #e2e8f0);
}

.highlights li:first-child {
  border-top: none;
}

.highlight-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  color: #fa8072;
}

.highlight-title {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 600;
}

.highlight-detail {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary, #718096);
}

.plus-grant {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(250, 128, 114, 0.12);
  font-size: 13px;
  line-height: 1.5;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.changelog-link {
  font-size: 13px;
  color: var(--text-secondary, #718096);
}

.primary-action {
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #fa8072;
  color: #ffffff;
}

.primary-action:hover {
  background: #f4685a;
}

@media (max-width: 480px) {
  .actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .primary-action {
    width: 100%;
  }

  .changelog-link {
    text-align: center;
  }
}
</style>
