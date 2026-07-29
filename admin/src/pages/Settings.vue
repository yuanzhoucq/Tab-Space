<template>
  <div class="settings-page">
    <div class="container">
      <nav class="nav-header">
        <router-link class="back-link" to="/">
          <v-icon name="arrow-left" class="back-icon"></v-icon>
          {{lang.back}}
        </router-link>
      </nav>
      
      <header class="page-header">
        <h1>Tab Space {{lang.settings}}</h1>
      </header>

      <div class="settings-content">
        <!-- Subscription (only when the native extension speaks protocol v2).
             Purchases and management happen in the host app; this block is the
             persistent status + restore surface App Review expects. -->
        <div class="card" v-if="aiEnabled" data-testid="subscription-card">
          <h2 class="section-title">{{lang.subscription || 'Subscription'}}</h2>

          <div class="plan-row">
            <span class="plan-label">{{lang.currentPlan || 'Current plan'}}</span>
            <span class="plan-value" :class="{ premium: isPremium || hasPermanentPlus }" data-testid="plan-status">
              <v-icon v-if="isPremium || hasPermanentPlus" name="check-circle" class="plan-icon"></v-icon>
              <span>{{ currentPlanLabel }}</span>
              <del v-if="hasPermanentPlus && plusDisplayPrice"
                   class="plus-price"
                   data-testid="settings-plus-price">{{ plusDisplayPrice }}</del>
            </span>
          </div>

          <p v-if="hasPermanentPlus" class="help-text" data-testid="settings-plus-summary">
            {{lang.plusOwnedSummary || 'Unlimited sessions and all core features are yours permanently. You also receive 5 AI requests each week; Pro makes AI unlimited.'}}
          </p>

          <div v-if="!isPremium && quotaKnown" class="quota-block">
            <p class="quota-line">
              <template v-if="unlimitedQuota">{{lang.aiQuotaUnlimited || 'Unlimited AI requests'}}</template>
              <template v-else>{{ quotaLabel }}</template>
            </p>
            <p v-if="!unlimitedQuota && quotaResetLabel" class="help-text">{{ quotaResetLabel }}</p>
          </div>

          <div class="subscription-actions">
            <button v-if="!isPremium" type="button" class="primary-action"
                    data-testid="settings-upgrade" @click="openSubscription">
              {{lang.upgrade || 'Upgrade'}}
            </button>
            <button v-else type="button" class="secondary-action"
                    data-testid="manage-subscription" @click="manageSubscription">
              {{lang.manageSubscription || 'Manage subscription'}}
            </button>
            <button type="button" class="secondary-action" :disabled="restoring"
                    data-testid="restore-purchases" @click="restore">
              {{ restoring ? (lang.restoring || 'Restoring…') : (lang.restorePurchases || 'Restore Purchases') }}
            </button>
          </div>

          <p v-if="purchaseRedirecting" class="help-text redirect-note" data-testid="redirect-note">
            {{lang.continueInApp || 'Continuing in the Tab Space app…'}}
          </p>
          <p class="help-text">{{lang.subscriptionManagedInApp || 'Plans and payment are handled securely in the Tab Space app.'}}</p>
          <p class="help-text legal-links">
            <!-- Apple's standard EULA: it governs these purchases unless we
                 publish our own terms, and mytab.space has no terms page. -->
            <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener">{{lang.terms || 'Terms of Use'}}</a>
            <span class="footer-sep">·</span>
            <a href="https://mytab.space/privacy.html" target="_blank" rel="noopener">{{lang.privacy}}</a>
          </p>
        </div>

        <!-- General Preferences -->
        <div class="card">
          <h2 class="section-title">{{lang.generalPreferences}}</h2>
          <div class="setting-list">
            <div class="setting-item" v-for="setting in settingsForBridge" :key="setting">
              <label :for="setting" class="setting-label">{{lang[setting]}}</label>
              <toggle-button
                :id="setting"
                :value="tabSpaceSettings[setting]==='true'"
                :sync="true"
                :color="{checked: '#fa8072', unchecked: '#ccc'}"
                @change="(e) => setDefault(e, setting)"
              />
            </div>
          </div>
        </div>

        <!-- Localization -->
        <div class="card">
          <h2 class="section-title">{{lang.localization}}</h2>
          <div class="form-group">
            <label for="language-select" class="form-label">{{lang.language}}</label>
            <div class="custom-select-wrapper">
              <select name="languages" id="language-select" class="custom-select" v-model="tabSpaceSettings[preferredLanguageKey]" @change="setLanguage">
                <option v-for="language in languages" :key="`lang-${language.code}`" :value="language.code">{{language.name}}</option>
              </select>
              <v-icon name="chevron-down" class="select-arrow-icon"></v-icon>
            </div>
            <p class="help-text">
              <a href="https://mytab.space/translate.html" target="_blank">{{lang.helpTranslate}}</a>
            </p>
          </div>
        </div>

        <!-- AI (only when the native extension speaks protocol v2) -->
        <div class="card" v-if="aiEnabled">
          <h2 class="section-title">{{lang.aiSection || 'AI'}}</h2>
          <p v-if="!isPremium" class="help-text">{{lang.proOnlyInfo || 'Free and Plus include 5 AI requests each week. Pro removes the weekly limit.'}}</p>
          <div class="form-group" style="margin-bottom: 0;">
            <label for="suggested-tags" class="form-label">{{lang.suggestedTags || 'Suggested Tags'}}</label>
            <textarea
              id="suggested-tags"
              class="form-input form-textarea"
              rows="3"
              v-model="tagsDraft"
              :placeholder="currentDefaultTags"
              @blur="saveSuggestedTags"
            ></textarea>
            <p class="help-text">{{lang.suggestedTagsHint || 'Comma-separated tags the AI will prefer to use'}}</p>
          </div>
        </div>

        <!-- Shortcuts -->
        <div class="card" v-if="!isWebExtension">
          <h2 class="section-title">{{lang.shortcuts}}</h2>
          <p class="text-muted text-sm mb-4">{{lang.shortcutTip}}</p>
          
          <div class="shortcuts-grid">
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>D</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlD}}</div>
            </div>
            
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>L</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlL}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>R</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlR}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>K</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlK}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>Q</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlQ}}</div>
            </div>
            
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>;</kbd>
              </div>
              <div class="shortcut-desc">{{lang.saveAndCloseTabs}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>S</kbd>
              </div>
              <div class="shortcut-desc">{{lang.saveCurrentTab}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>T</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlT}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>B</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlB}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>M</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlM}}</div>
            </div>

            <!-- External Browser Shortcuts -->
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>C</kbd>
              </div>
              <div class="shortcut-desc">
                 {{lang.openIn}} 
                 <div class="custom-select-wrapper inline-select-wrapper">
                   <select class="custom-select inline-select" v-model="tabSpaceSettings[externalBrowser1Key]" @change="(e) => setExternalBrowser(1, e)">
                      <option v-for="browser in browsers" :key="`b1-${browser}`" :value="browser">{{browser}}</option>
                   </select>
                   <v-icon name="chevron-down" class="select-arrow-icon inline"></v-icon>
                 </div>
              </div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>F</kbd>
              </div>
              <div class="shortcut-desc">
                 {{lang.openIn}} 
                 <div class="custom-select-wrapper inline-select-wrapper">
                   <select class="custom-select inline-select" v-model="tabSpaceSettings[externalBrowser2Key]" @change="(e) => setExternalBrowser(2, e)">
                      <option v-for="browser in browsers" :key="`b2-${browser}`" :value="browser">{{browser}}</option>
                   </select>
                   <v-icon name="chevron-down" class="select-arrow-icon inline"></v-icon>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer class="page-footer">
        <a class="footer-link" href="mailto:support@mytab.space">{{lang.contact}}</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://twitter.com/joyuer/status/1164816334305157120" target="_blank">Twitter</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://mytab.space" target="_blank">{{lang.about}}</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://mytab.space/#faq" target="_blank" rel="noopener">FAQ</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://mytab.space/privacy.html" target="_blank" rel="noopener">{{lang.privacy}}</a>
        <p class="build-info">
          <a v-if="buildInfo.commitUrl" :href="buildInfo.commitUrl" target="_blank" rel="noopener">Build {{buildInfo.shortSha}}{{buildInfo.time ? ` · ${buildInfo.time}` : ''}}</a>
          <span v-else>Build {{buildInfo.shortSha}}</span>
        </p>
      </footer>
    </div>
  </div>
</template>

<script>
import { ToggleButton } from 'vue-js-toggle-button'
import { mapState, mapGetters } from 'vuex'
import Constants from '../constants'
import buildInfo from '../build-info'

export default {
  name: "Settings",
  components: {
    ToggleButton
  },
  data() {
    return {
      ...Constants,
      buildInfo,
      tagsDraft: "",
      restoring: false
    };
  },
  mounted() {
    // Status can be stale if the user subscribed in the host app since the last
    // bridge handshake; re-ask every time Settings opens.
    this.refreshSubscriptionStatus()
  },
  watch: {
    // Keep the editable draft in step with the native default once it arrives.
    suggestedTagsValue: {
      immediate: true,
      handler(value) { this.tagsDraft = value }
    }
  },
  computed: {
    ...mapState(["lang", "bridge", "tabSpaceSettings", "aiQuotaRemaining", "aiQuotaResetAt", "plusDisplayPrice", "purchaseRedirecting"]),
    ...mapGetters(["aiEnabled", "isPremium", "hasPermanentPlus"]),
    currentPlanLabel() {
      if (this.isPremium) return this.lang.planPremium || 'Pro'
      if (this.hasPermanentPlus) return this.lang.planPlus || 'Plus · Permanent'
      return this.lang.planFree || 'Free'
    },
    isWebExtension() {
      return this.bridge && this.bridge.mode === "webextension"
    },
    settingsForBridge() {
      if (!this.isWebExtension) return this.settings
      const safariOnly = new Set(["shift-shortcuts", "disable-shortcuts", "disable-context-menus"])
      return this.settings.filter(setting => !safariOnly.has(setting))
    },
    quotaKnown() {
      return this.aiQuotaRemaining !== null && this.aiQuotaRemaining !== undefined
    },
    unlimitedQuota() {
      return this.aiQuotaRemaining === -1
    },
    quotaLabel() {
      const template = this.lang.aiQuotaRemaining || '{count} AI requests left this week'
      return template.replace('{count}', Math.max(0, this.aiQuotaRemaining))
    },
    quotaResetLabel() {
      if (!this.aiQuotaResetAt) return ''
      const resetDate = new Date(this.aiQuotaResetAt * 1000)
      if (isNaN(resetDate.getTime())) return ''
      const locale = this.tabSpaceSettings[Constants.preferredLanguageKey] || undefined
      const formatted = resetDate.toLocaleString(locale, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      })
      const template = this.lang.quotaResetsAt || 'Resets {date}'
      return template.replace('{date}', formatted)
    },
    suggestedTagsValue() {
      return this.tabSpaceSettings[Constants.suggestedTagsKey] || ''
    },
    currentDefaultTags() {
      const lang = this.tabSpaceSettings[Constants.preferredLanguageKey] || 'en-us'
      return Constants.defaultSuggestedTags[lang] || Constants.defaultSuggestedTags['en-us']
    }
  },
  methods: {
    refreshSubscriptionStatus() {
      if (!this.aiEnabled || !this.bridge) return
      this.bridge.send({cmd: "CheckSubscriptionStatus"})
    },
    openSubscription() {
      this.$store.commit("setShowSubscriptionModal", true)
    },
    // Management, like purchasing, is owned by the host app: the native side
    // brings it forward and replies PurchaseResult { redirected: true }.
    manageSubscription() {
      if (!this.bridge) return
      this.bridge.send({cmd: "PurchaseSubscription"})
    },
    restore() {
      if (!this.bridge) return
      this.restoring = true
      this.bridge.send({cmd: "RestorePurchases"})
      setTimeout(() => { this.restoring = false }, 3000)
    },
    setDefault(e, setting) {
      const value = e.value ? "true" : "false";
      this.bridge.send({cmd: "SetDefault", name: setting, value})
    },
    setLanguage(e) {
      this.bridge.send({cmd: "SetDefault", name: Constants.preferredLanguageKey, value: e.target.value})
    },
    setExternalBrowser(number, e) {
      let key = number == 1 ? Constants.externalBrowser1Key : Constants.externalBrowser2Key
      this.bridge.send({cmd: "SetDefault", name: key, value: e.target.value})
    },
    saveSuggestedTags() {
      const raw = (this.tagsDraft || '').trim()
      if (!raw) {
        // Empty is fine — the native side falls back to the language default.
        this.tagsDraft = ''
        this.bridge.send({cmd: "SetDefault", name: Constants.suggestedTagsKey, value: ''})
        return
      }
      const tags = raw
        .split(/[,;\n]+/)
        .map(t => t.trim())
        .filter(t => t && t.length <= 50)
      if (tags.length === 0) {
        this.tagsDraft = this.suggestedTagsValue
        return
      }
      const normalized = tags.join(', ')
      this.tagsDraft = normalized
      this.bridge.send({cmd: "SetDefault", name: Constants.suggestedTagsKey, value: normalized})
    }
  }
};
</script>

<style scoped>
.settings-page {
  padding: 24px 20px;
  min-height: 100vh;
}

.container {
  max-width: 700px;
  margin: 0 auto;
}

.nav-header {
  margin-bottom: 16px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.back-link:hover {
  background-color: rgba(0, 0, 0, 0.06);
}

.back-icon {
  margin-right: 6px;
  width: 18px;
  height: 18px;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 24px;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.setting-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
}

.setting-label {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-primary);
}

/* --- Subscription block --- */
.plan-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.plan-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.plan-value {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.plan-value.premium {
  color: #10b981;
}

.plan-icon {
  width: 15px;
  height: 15px;
}

.plus-price {
  color: var(--text-secondary);
  font-weight: 500;
  opacity: 0.75;
}

.quota-block {
  margin-top: 10px;
}

.quota-line {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.subscription-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.primary-action {
  padding: 8px 16px;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
  background: var(--primary-color);
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.secondary-action {
  padding: 8px 16px;
  font: inherit;
  font-size: 0.85rem;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.secondary-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.redirect-note {
  color: var(--primary-color);
}

.legal-links a {
  color: inherit;
}

.form-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(250, 128, 114, 0.2);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

/* Custom Select Styles */
.custom-select-wrapper {
  position: relative;
  display: inline-block;
  width: 100%;
  max-width: 240px;
}

.custom-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 100%;
  padding: 8px 32px 8px 12px;
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

.custom-select:hover {
  border-color: var(--primary-color);
  background-color: var(--card-bg);
}

.custom-select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(250, 128, 114, 0.25);
}

.select-arrow-icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text-secondary);
  width: 14px;
  height: 14px;
}

.select-arrow-icon.inline {
  right: 6px;
  width: 12px;
  height: 12px;
}

/* Inline select for shortcuts */
.inline-select-wrapper {
  width: auto;
  max-width: none;
  display: inline-flex;
  vertical-align: middle;
}

.inline-select {
  padding: 4px 24px 4px 8px;
  font-size: 0.8rem;
  min-width: 90px;
}

.help-text {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.help-text a {
  color: var(--text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.help-text a:hover {
  color: var(--primary-color);
}

.text-muted {
  color: var(--text-secondary);
}

.text-sm {
  font-size: 0.8rem;
}

.mb-4 {
  margin-bottom: 0.75rem;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.shortcut-item {
  padding: 10px 12px;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
  font-size: 0.8em;
  justify-content: flex-start;
}

.key-sep {
  margin: 0 3px;
  color: var(--text-secondary);
  opacity: 0.6;
}

.shortcut-desc {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
  text-align: left;
  margin-left: 5px;
}

.page-footer {
  margin-top: 40px;
  text-align: center;
  color: var(--text-secondary);
  padding-bottom: 24px;
  font-size: 0.85rem;
  flex-wrap: wrap;
}

.footer-link {
  color: var(--text-secondary);
  margin: 0 4px;
}

.footer-link:hover {
  color: var(--primary-color);
}

.footer-sep {
  margin: 0 6px;
  opacity: 0.5;
}

.build-info {
  flex-basis: 100%;
  margin-top: 8px;
  font-size: 0.75rem;
  opacity: 0.7;
}

.build-info a,
.build-info span {
  color: var(--text-secondary);
}

.build-info a:hover {
  color: var(--primary-color);
}

@media (max-width: 600px) {
  .shortcuts-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .back-link:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
}
</style>
