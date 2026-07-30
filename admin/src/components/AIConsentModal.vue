<template>
  <div v-if="showAIConsentModal" class="ai-consent-overlay" @click.self="decline">
    <div class="ai-consent-modal" role="dialog" aria-modal="true"
         aria-labelledby="ai-consent-title" data-testid="ai-consent-modal">
      <div class="modal-header">
        <h2 id="ai-consent-title">{{ lang.aiConsentTitle || 'Before Tab Space uses AI' }}</h2>
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
          <button type="button" class="secondary-action" data-testid="ai-consent-decline"
                  @click="decline">
            {{ lang.aiConsentDecline || 'Not now' }}
          </button>
          <button type="button" class="primary-action" data-testid="ai-consent-accept"
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
 */
import { mapState } from 'vuex'
import Constants from '../constants'

export default {
  // Registered as AiConsentModal so the kebab-case tag resolves: a name with
  // consecutive capitals would become <a-i-consent-modal>. Matches AiToast.
  name: 'AiConsentModal',
  computed: {
    ...mapState(['lang', 'bridge', 'showAIConsentModal', 'aiConsentPendingRetry'])
  },
  methods: {
    accept() {
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
    decline() {
      this.$store.commit('setAIConsentPrompt', { show: false })
    }
  }
}
</script>

<style scoped>
.ai-consent-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1150;
  backdrop-filter: blur(4px);
}

.ai-consent-modal {
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
