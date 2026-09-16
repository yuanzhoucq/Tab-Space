<template>
  <div v-if="showAIConsentModal" class="ai-disclosure-overlay" @click.self="decline">
    <div class="ai-disclosure-modal" role="dialog" aria-modal="true"
         aria-labelledby="ai-disclosure-title" data-testid="ai-disclosure-modal">
      <div class="modal-header">
        <h2 id="ai-disclosure-title">{{ lang.aiConsentTitle || 'Before Tab Space uses AI' }}</h2>
      </div>

      <div class="modal-content">
        <p class="lede">{{ lang.aiConsentLede || 'AI features send some information about your tabs off your device. Here is exactly what happens.' }}</p>

        <ul class="facts">
          <li>
            <v-icon name="upload" class="fact-icon"></v-icon>
            <div>
              <p class="fact-title">{{ lang.aiConsentSentTitle || 'What is sent' }}</p>
              <p class="fact-detail">{{ lang.aiConsentSentDetail || 'Only the page titles and URLs of the tabs in that session. Never page contents, cookies, form data, or anything from other tabs.' }}</p>
            </div>
          </li>
          <li>
            <v-icon name="server" class="fact-icon"></v-icon>
            <div>
              <p class="fact-title">{{ lang.aiConsentRecipientsTitle || 'Who receives it' }}</p>
              <p class="fact-detail">{{ lang.aiConsentRecipientsDetail || 'The Tab Space AI service, hosted on Cloudflare, which forwards the titles and URLs to Google Gemini to generate the result. Tab Space does not store them and does not use them to train models.' }}</p>
            </div>
          </li>
          <li>
            <v-icon name="zap" class="fact-icon"></v-icon>
            <div>
              <p class="fact-title">{{ lang.aiConsentQuotaTitle || 'What it costs you' }}</p>
              <p class="fact-detail">{{ lang.aiConsentQuotaDetail || 'Free and Plus include 5 AI requests each week. Each AI action uses one. Pro removes the weekly limit.' }}</p>
            </div>
          </li>
        </ul>

        <p class="revoke-note">{{ lang.aiConsentRevokeNote || 'You can turn AI off again at any time in Settings. Nothing is sent while it is off.' }}</p>

        <div class="actions">
          <button type="button" class="secondary-action" data-testid="ai-disclosure-decline"
                  @click="decline">
            {{ lang.aiConsentDecline || 'Not now' }}
          </button>
          <button type="button" class="primary-action" data-testid="ai-disclosure-accept"
                  @click="accept">
            {{ lang.aiConsentAccept || 'Allow and continue' }}
          </button>
        </div>

        <p class="policy-note">
          <a href="https://mytab.space/privacy.html" target="_blank" rel="noopener">
            {{ lang.privacyPolicy || 'Privacy Policy' }}
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * The AI data-flow disclosure required before any AI request (design §7).
 *
 * The native side is the enforcement point: it answers every AI request with
 * `consent_required` until the disclosure has been accepted, and the bridge
 * turns that code into this dialog. Accepting writes the acceptance through the
 * normal SetDefault path, then re-sends whatever request triggered the prompt so
 * the user's original click is not lost.
 *
 * Nothing in the dialog's class, id or test-id names says "consent": cookie
 * notice blockers hide elements by exactly that word, and a hidden disclosure
 * leaves every AI action a silent no-op with no way for the user to find out
 * why. For the same reason the dialog checks, once rendered, that it is
 * actually on screen, and falls back to the browser's own confirm() — which no
 * page style can hide — when it is not.
 */
import { mapState } from 'vuex'
import Constants from '../constants'

// Long enough for an extension that hides elements after they appear (a
// MutationObserver, not a stylesheet) to have acted; short enough that a user
// staring at a blank page gets the fallback before they click again.
const VISIBILITY_CHECK_DELAY_MS = 300

export default {
  // Registered as AiConsentModal so the kebab-case tag resolves: a name with
  // consecutive capitals would become <a-i-consent-modal>. Matches AiToast.
  name: 'AiConsentModal',
  data() {
    return { visibilityCheckTimer: null }
  },
  computed: {
    ...mapState(['lang', 'bridge', 'showAIConsentModal', 'aiConsentPendingRetry'])
  },
  watch: {
    showAIConsentModal(show) {
      clearTimeout(this.visibilityCheckTimer)
      if (!show) return
      this.$nextTick(() => {
        this.visibilityCheckTimer = setTimeout(() => this.confirmVisible(), VISIBILITY_CHECK_DELAY_MS)
      })
    }
  },
  beforeDestroy() {
    clearTimeout(this.visibilityCheckTimer)
  },
  methods: {
    // The dialog counts as shown only when it is on screen, not merely rendered:
    // a blocker's `display: none`, an overlay whose offsets never applied (it
    // then sits at the end of the document, below the fold), or a node an
    // extension removed all leave the user looking at a page that did nothing.
    confirmVisible() {
      if (!this.showAIConsentModal || this.isOnScreen()) return
      console.warn('Tab Space: the AI disclosure dialog is not visible; asking through the browser instead.')
      this.askThroughBrowser()
    },
    isOnScreen() {
      const overlay = this.$el
      if (!(overlay instanceof HTMLElement) || !overlay.isConnected) return false
      const dialog = overlay.querySelector('[role="dialog"]')
      if (!dialog) return false
      for (const element of [overlay, dialog]) {
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      }
      const rect = dialog.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return false
      return rect.bottom > 0 && rect.right > 0
        && rect.top < window.innerHeight && rect.left < window.innerWidth
    },
    // The same disclosure, as plain text, through a dialog the page cannot
    // style away. Confirming is exactly a click on "Allow and continue".
    askThroughBrowser() {
      const lang = this.lang
      const text = [
        lang.aiConsentTitle || 'Before Tab Space uses AI',
        lang.aiConsentLede || 'AI features send some information about your tabs off your device. Here is exactly what happens.',
        `${lang.aiConsentSentTitle || 'What is sent'}: ${lang.aiConsentSentDetail || 'Only the page titles and URLs of the tabs in that session. Never page contents, cookies, form data, or anything from other tabs.'}`,
        `${lang.aiConsentRecipientsTitle || 'Who receives it'}: ${lang.aiConsentRecipientsDetail || 'The Tab Space AI service, hosted on Cloudflare, which forwards the titles and URLs to Google Gemini to generate the result. Tab Space does not store them and does not use them to train models.'}`,
        `${lang.aiConsentQuotaTitle || 'What it costs you'}: ${lang.aiConsentQuotaDetail || 'Free and Plus include 5 AI requests each week. Each AI action uses one. Pro removes the weekly limit.'}`,
        lang.aiConsentRevokeNote || 'You can turn AI off again at any time in Settings. Nothing is sent while it is off.'
      ].join('\n\n')
      if (window.confirm(text)) this.accept()
      else this.decline()
    },
    // Only a person may answer the disclosure. A click an extension synthesises
    // (isTrusted false) is exactly the auto-dismiss that cookie notice helpers
    // perform, and it must neither refuse nor grant on the user's behalf.
    isSynthetic(event) {
      return Boolean(event) && event.isTrusted === false
    },
    accept(event) {
      if (this.isSynthetic(event)) return
      if (!this.bridge) return
      const retry = this.aiConsentPendingRetry
      this.bridge.send({
        cmd: 'SetDefault',
        name: Constants.aiConsentVersionKey,
        value: String(Constants.aiConsentVersion)
      })
      this.$store.commit('setTabSpaceSetting', {
        key: Constants.aiConsentVersionKey,
        value: String(Constants.aiConsentVersion)
      })
      this.$store.commit('setAIConsentPrompt', { show: false })
      if (!retry) return
      // Keep local state in step when the pending action is itself a default
      // write (the Settings auto-enhance toggle), since SetDefault has no reply.
      if (retry.cmd === 'SetDefault' && retry.name) {
        this.$store.commit('setTabSpaceSetting', { key: retry.name, value: retry.value })
      }
      // The native side has to have stored the acceptance before it will honour
      // the retry, and SetDefault carries no reply, so give it a beat.
      setTimeout(() => {
        if (this.bridge) this.bridge.send(retry)
      }, 150)
    },
    decline(event) {
      if (this.isSynthetic(event)) return
      this.$store.commit('setAIConsentPrompt', { show: false })
    }
  }
}
</script>

<style scoped>
.ai-disclosure-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1150;
  backdrop-filter: blur(4px);
}

.ai-disclosure-modal {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #2d3748);
  border-radius: 16px;
  max-width: 520px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  padding: 20px 24px 14px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.modal-header h2 {
  margin: 0;
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

.facts {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}

.facts li {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border-color, #e2e8f0);
}

.facts li:first-child {
  border-top: none;
}

.fact-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  color: #fa8072;
}

.fact-title {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 600;
}

.fact-detail {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary, #718096);
}

.revoke-note {
  margin: 0 0 18px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary, #718096);
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.primary-action,
.secondary-action {
  border-radius: 10px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
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

.policy-note {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12px;
}

.policy-note a {
  color: var(--text-secondary, #718096);
}

@media (max-width: 480px) {
  .actions {
    flex-direction: column-reverse;
  }

  .primary-action,
  .secondary-action {
    width: 100%;
  }
}
</style>
