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
        <span class="version-pill" aria-hidden="true">{{ version }}</span>
        <h2 id="whats-new-title">{{ title }}</h2>
      </div>

      <div class="modal-content">
        <p class="lede">{{ lede }}</p>

        <img class="whats-new-shot"
             :src="switcherShot"
             :alt="lang.switcherTitle">

        <ul class="highlights">
          <li>
            <v-icon name="search" class="highlight-icon"></v-icon>
            <div>
              <p class="highlight-title">{{ switcherTitle }}</p>
              <p class="highlight-detail">{{ lang.whatsNewSwitcherDetail }}</p>
            </div>
          </li>
          <li>
            <v-icon name="clock" class="highlight-icon"></v-icon>
            <div>
              <p class="highlight-title">{{ lang.whatsNewSavedTitle }}</p>
              <p class="highlight-detail">{{ lang.whatsNewSavedDetail }}</p>
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

        <p class="settings-note">{{ lang.switcherSettingsNote }}</p>

        <div class="actions">
          <a class="changelog-link"
             href="https://mytab.space/changelog.html"
             target="_blank"
             rel="noopener noreferrer">{{ lang.whatsNewChangelog }}</a>
          <div class="action-buttons">
            <button type="button" class="secondary-action"
                    data-testid="whats-new-view-plans"
                    @click="viewPlans">
              {{ lang.viewPlans || 'View plans' }}
            </button>
            <button type="button" class="primary-action" ref="dismissButton"
                    data-testid="whats-new-dismiss"
                    @click="dismiss">
              {{ lang.whatsNewDismiss }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * One-time introduction to the current release — 4.1, the browser tab switcher.
 *
 * It appears once per browser for people who already had sessions before the
 * release, then never again: the accepted version is written to local storage,
 * so bumping Constants.whatsNewVersion is all a later release needs.
 *
 * A brand-new install has nothing to catch up on, so the flag is written
 * silently instead — otherwise the first thing a first-run user sees is a
 * summary of changes they never experienced.
 *
 * 4.1 is a macOS feature, so a reader who cannot have it (a phone, or a
 * companion browser still on a helper that predates the switcher) is left
 * alone — and, unlike the first-run case, the release is *not* marked seen, so
 * the introduction still arrives once the app catches up.
 *
 * Settings can reopen it at any time (whatsNewRequested), which is the only way
 * back once the release has been seen.
 */
import { mapGetters, mapState } from 'vuex'
import Constants from '../constants'
import { whatsNewSeenVersionKey, readBannerFlag, writeBannerFlag } from '../banners'
import switcherShot from '../assets/switcher-panel.png'

export default {
  name: 'WhatsNewModal',
  data() {
    return {
      armed: false,
      resolved: false,
      switcherShot
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
    ...mapGetters(['savedSessionCount', 'switcherAvailable']),
    version() {
      return Constants.whatsNewVersion
    },
    title() {
      return this.withVersion(this.lang.whatsNewTitle, "What's new in Tab Space {version}")
    },
    lede() {
      return this.withVersion(this.lang.whatsNewLede, 'Version {version} adds a browser tab switcher.')
    },
    switcherTitle() {
      const template = this.lang.whatsNewSwitcherTitle || 'Press {shortcut} anywhere'
      return template.replace('{shortcut}', Constants.switcherShortcut)
    },
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
    // The capability handshake can land after the first refresh, so a companion
    // browser only becomes eligible partway through the session.
    switcherAvailable() {
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
      // Nothing to announce yet, and nothing to record either: this reader gets
      // the introduction when the switcher actually reaches them.
      if (!this.switcherAvailable) return
      this.armed = true
    },
    dismiss() {
      this.armed = false
      this.resolved = true
      if (this.whatsNewRequested) this.$store.commit('setWhatsNewRequested', false)
      writeBannerFlag(whatsNewSeenVersionKey, Constants.whatsNewVersion)
    },
    // Hand off to the plan comparison: this dialog counts as seen either way,
    // so closing that one does not bring this one back.
    viewPlans() {
      this.dismiss()
      this.$store.commit('setShowSubscriptionModal', true)
    },
    withVersion(template, fallback) {
      return (template || fallback).replace('{version}', Constants.whatsNewVersion)
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

/* The switcher panel shot, straight from the App Store artwork set. */
.whats-new-shot {
  display: block;
  width: 100%;
  margin: 0 0 18px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
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

/* The shortcut is rebindable and the menu bar icon optional, but both live in
   the native app — the dashboard can only say where to look. */
.settings-note {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(250, 128, 114, 0.12);
  font-size: 12.5px;
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

.action-buttons {
  display: flex;
  gap: 10px;
}

.primary-action,
.secondary-action {
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.primary-action {
  background: #fa8072;
  color: #ffffff;
}

.primary-action:hover {
  background: #f4685a;
}

.secondary-action {
  background: transparent;
  color: var(--text-primary, #2d3748);
  border-color: var(--border-color, #e2e8f0);
}

.secondary-action:hover {
  background: var(--hover-bg, #f7fafc);
}

@media (max-width: 480px) {
  .actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .action-buttons {
    flex-direction: column-reverse;
  }

  .primary-action,
  .secondary-action {
    width: 100%;
  }

  .changelog-link {
    text-align: center;
  }
}
</style>
