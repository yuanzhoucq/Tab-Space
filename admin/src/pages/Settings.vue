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

          <!-- -1 (unlimited) is only meaningful for Pro; when a non-Pro tier is
               paired with it the native state is stale, so do not present an
               "Unlimited" readout that contradicts the plan shown above. -->
          <div v-if="!isPremium && quotaKnown && !unlimitedQuota" class="quota-block">
            <p class="quota-line">
              {{ quotaLabel }}
            </p>
            <p v-if="quotaResetLabel" class="help-text">{{ quotaResetLabel }}</p>
          </div>

          <!-- The plan comparison stays reachable at every tier: a Pro
               subscriber still needs to see what the plan covers. -->
          <div class="subscription-actions">
            <button v-if="!isPremium" type="button" class="primary-action"
                    data-testid="settings-upgrade" @click="openSubscription">
              {{lang.upgrade || 'Upgrade'}}
            </button>
            <template v-else>
              <button type="button" class="secondary-action"
                      data-testid="settings-view-plans" @click="openSubscription">
                {{lang.viewPlans || 'View plans'}}
              </button>
              <button type="button" class="secondary-action"
                      data-testid="manage-subscription" @click="manageSubscription">
                {{lang.manageSubscription || 'Manage subscription'}}
              </button>
            </template>
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

        <!-- Multi-browser (Pro). Gated on protocol v2 for the same reason as
             the blocks around it: the pairing flow only exists in the 4.0 app. -->
        <div class="card" v-if="aiEnabled" data-testid="multi-browser-card">
          <h2 class="section-title">{{lang.multiBrowser || 'Multi-browser'}}</h2>

          <div class="feature-lede">
            <v-icon name="globe" class="feature-lede-icon"></v-icon>
            <div class="feature-lede-text">
              <p class="feature-title">{{lang.featureMultiBrowserTitle || 'Multi-browser support'}}</p>
              <p class="help-text feature-desc">{{lang.featureMultiBrowserDesc || 'Use the same sessions in Safari, Chrome, Microsoft Edge, and Firefox.'}}</p>
            </div>
            <span class="plan-pill" :class="{ unlocked: isPremium }" data-testid="multi-browser-pill">
              {{lang.planPremium || 'Pro'}}
            </span>
          </div>

          <p v-if="isWebExtension" class="connected-note" data-testid="multi-browser-connected">
            <v-icon name="check-circle" class="connected-icon"></v-icon>
            <span>{{lang.multiBrowserConnected || 'This browser is connected to Tab Space.'}}</span>
          </p>

          <ol class="steps" data-testid="multi-browser-steps">
            <li>{{lang.multiBrowserStep1 || 'Open Tab Space on your Mac, choose Multi-Browser Support, then Show Pairing Code.'}}</li>
            <li>{{lang.multiBrowserStep2 || 'Install the Tab Space extension in Chrome, Microsoft Edge, or Firefox 121 or later.'}}</li>
            <li>{{lang.multiBrowserStep3 || 'Enter the six-digit code in the extension to connect it.'}}</li>
          </ol>

          <div v-if="!isPremium" class="subscription-actions">
            <button type="button" class="primary-action"
                    data-testid="multi-browser-upgrade" @click="openSubscription">
              {{lang.upgrade || 'Upgrade'}}
            </button>
          </div>
          <p v-if="!isPremium" class="help-text">{{lang.multiBrowserProNote || 'Multi-browser support is included with Pro.'}}</p>
          <p class="help-text">
            <a href="https://mytab.space/multi-browser.html" target="_blank" rel="noopener"
               data-testid="multi-browser-guide">{{lang.multiBrowserGuide || 'Multi-browser setup guide'}}</a>
          </p>
        </div>

        <!-- AI (only when the native extension speaks protocol v2) -->
        <div class="card" v-if="aiEnabled">
          <h2 class="section-title">{{lang.aiSection || 'AI'}}</h2>
          <p v-if="!isPremium" class="help-text">{{lang.proOnlyInfo || 'Free and Plus include 5 AI requests each week. Pro removes the weekly limit.'}}</p>

          <!-- Auto-enhance is the only AI path that runs without an explicit
               click, so it is off until the user turns it on here and accepts
               the data-flow disclosure. -->
          <div class="setting-list">
            <div class="setting-item">
              <label for="ai-auto-enhance" class="setting-label">
                {{lang.aiAutoEnhanceTitle || 'AI titles and tags'}}
              </label>
              <toggle-button
                id="ai-auto-enhance"
                data-testid="ai-auto-enhance-toggle"
                :value="autoEnhanceEnabled"
                :sync="true"
                :color="{checked: '#fa8072', unchecked: '#ccc'}"
                @change="setAutoEnhance"
              />
            </div>
          </div>
          <p class="help-text" style="margin-bottom: 18px;">
            {{lang.aiAutoEnhanceDescription || 'After you save tabs, AI names the session and adds tags automatically. Only page titles and URLs are sent.'}}
          </p>

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
        <a class="footer-link" href="https://mytab.space" target="_blank">{{lang.about}}</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://mytab.space/#faq" target="_blank" rel="noopener">FAQ</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://mytab.space/privacy.html" target="_blank" rel="noopener">{{lang.privacy}}</a>
        <template v-if="whatsNewEnabled">
          <span class="footer-sep">·</span>
          <button type="button" class="footer-link footer-button"
                  data-testid="settings-whats-new"
                  @click="openWhatsNew">{{lang.whatsNewOpen}}</button>
        </template>
        <p class="build-info">
          <a v-if="buildInfo.commitUrl" :href="buildInfo.commitUrl" target="_blank" rel="noopener">Build {{buildInfo.shortSha}}{{buildInfo.time ? ` · ${buildInfo.time}` : ''}}</a>
          <span v-else>Build {{buildInfo.shortSha}}</span>
          <span class="build-sep">·</span>
          <a href="https://joyuer.cn/" target="_blank" rel="noopener">{{lang.madeBy}}</a>
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
    aiConsentGranted() {
      const accepted = Number(this.tabSpaceSettings[Constants.aiConsentVersionKey] || 0)
      return accepted >= Constants.aiConsentVersion
    },
    // Mirrors AutoEnhance.isEnabled on the native side: the toggle only reads as
    // on when consent is in place, so revoking consent cannot leave the UI
    // claiming that background enhancement is still running.
    autoEnhanceEnabled() {
      return this.aiConsentGranted
        && this.tabSpaceSettings[Constants.autoEnhanceKey] === 'true'
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
    // The release introduction shows itself once; this is the way back to it.
    openWhatsNew() {
      if (!this.whatsNewEnabled) return
      this.$store.commit("setWhatsNewRequested", true)
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
    // Turning auto-enhance ON is the first moment background AI would start
    // sending data, so it needs the disclosure first. Turning it OFF is always
    // allowed immediately.
    setAutoEnhance(e) {
      if (!this.bridge) return
      if (e.value && !this.aiConsentGranted) {
        this.$store.commit("setAIConsentPrompt", {
          show: true,
          retry: {cmd: "SetDefault", name: Constants.autoEnhanceKey, value: "true"}
        })
        return
      }
      const value = e.value ? "true" : "false"
      this.bridge.send({cmd: "SetDefault", name: Constants.autoEnhanceKey, value})
      this.$store.commit("setTabSpaceSetting", {key: Constants.autoEnhanceKey, value})
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

/* --- Multi-browser block --- */
.feature-lede {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.feature-lede-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--primary-color);
}

.feature-lede-text {
  flex: 1;
  min-width: 0;
}

.feature-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.feature-desc {
  margin-top: 0.25rem;
}

.plan-pill {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

.plan-pill.unlocked {
  border-color: transparent;
  background: var(--primary-color);
  color: #ffffff;
}

.connected-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  font-size: 0.85rem;
  color: #10b981;
}

.connected-icon {
  width: 15px;
  height: 15px;
}

.steps {
  margin: 14px 0 0;
  padding-left: 1.3rem;
  list-style: decimal;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

/* A bare global `li` rule in Admin.vue makes every list item a flex box with
   no marker and its own padding. Undo it for these steps. */
.steps li {
  display: list-item;
  list-style: decimal;
  padding: 0;
  margin-left: 0;
  margin-right: 0;
}

.steps li + li {
  margin-top: 5px;
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

/* Reads as one of the footer links, but reopens a dialog instead of navigating. */
.footer-button {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
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

.build-sep {
  margin: 0 6px;
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
