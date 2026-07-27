<template>
  <div v-if="showSubscriptionModal" class="subscription-modal-overlay" @click.self="close">
    <div class="subscription-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>{{ lang.aiPremium || 'Tab Space AI' }}</h2>
        <button type="button" class="close-btn" :aria-label="lang.cancel || 'Close'" @click="close">
          <v-icon name="x"></v-icon>
        </button>
      </div>

      <div class="modal-content">
        <!-- Already subscribed -->
        <div v-if="isPremium" class="already-premium">
          <v-icon name="check-circle" class="premium-check"></v-icon>
          <p>{{ lang.alreadyPremium || "You're on Tab Space AI Premium." }}</p>
        </div>

        <template v-else>
          <!-- Features -->
          <div class="features">
            <h3>{{ lang.unlockAI || 'Unlock AI-powered organizing' }}</h3>
            <ul>
              <li>
                <v-icon name="zap" class="feature-icon"></v-icon>
                <div>
                  <strong>{{ lang.featureEnhanceTitle || 'Smart titles & tags' }}</strong>
                  <p>{{ lang.featureEnhanceDesc || 'AI names and tags your sessions as you save.' }}</p>
                </div>
              </li>
              <li>
                <v-icon name="server" class="feature-icon"></v-icon>
                <div>
                  <strong>{{ lang.featureSplitTitle || 'Topic split' }}</strong>
                  <p>{{ lang.featureSplitDesc || 'Break a big session into clean, topic-based sessions.' }}</p>
                </div>
              </li>
              <li>
                <v-icon name="check-square" class="feature-icon"></v-icon>
                <div>
                  <strong>{{ lang.featureBatchTitle || 'One-click cleanup' }}</strong>
                  <p>{{ lang.featureBatchDesc || 'Apply a whole type of suggestion across your library at once.' }}</p>
                </div>
              </li>
              <li>
                <v-icon name="trending-up" class="feature-icon"></v-icon>
                <div>
                  <strong>{{ lang.featureUnlimitedTitle || 'Unlimited requests' }}</strong>
                  <p>{{ lang.featureUnlimitedDesc || 'Use AI as much as you like — no weekly limit.' }}</p>
                </div>
              </li>
            </ul>
          </div>

          <!-- Plan presentation (informational; final pricing lives in the app) -->
          <div class="plans">
            <div class="plan-card">
              <h4>{{ lang.planMonthly || 'Monthly' }}</h4>
            </div>
            <div class="plan-card recommended">
              <div class="best-value">{{ lang.planRecommended || 'Best value' }}</div>
              <h4>{{ lang.planYearly || 'Yearly' }}</h4>
            </div>
          </div>

          <button type="button" class="purchase-btn" :disabled="purchaseRedirecting" @click="subscribe">
            <span v-if="purchaseRedirecting">{{ lang.continueInApp || 'Continuing in the Tab Space app…' }}</span>
            <span v-else>{{ lang.subscribeInApp || 'Subscribe in Tab Space' }}</span>
          </button>

          <button type="button" class="restore-btn" :disabled="restoring || purchaseRedirecting" @click="restore">
            {{ restoring ? (lang.restoring || 'Restoring…') : (lang.restorePurchases || 'Restore Purchases') }}
          </button>

          <p class="managed-note">{{ lang.subscriptionManagedInApp || 'Plans and payment are handled securely in the Tab Space app.' }}</p>
          <div class="free-tier-info">{{ lang.freeTierInfo || 'Free plan: a weekly allowance of AI requests.' }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  name: 'SubscriptionModal',
  data() {
    return {
      restoring: false
    }
  },
  computed: {
    ...mapState(['lang', 'bridge', 'showSubscriptionModal', 'purchaseRedirecting']),
    ...mapGetters(['isPremium'])
  },
  watch: {
    isPremium(active) {
      // The redirect completed in the host app and status synced back.
      if (active) this.close()
    }
  },
  methods: {
    close() {
      this.$store.commit('setShowSubscriptionModal', false)
    },
    subscribe() {
      if (!this.bridge) return
      // Purchases run in the host app now (design §5.2). The native side replies
      // PurchaseResult { redirected: true }, which flips purchaseRedirecting.
      this.bridge.send({ cmd: 'PurchaseSubscription' })
    },
    restore() {
      if (!this.bridge) return
      this.restoring = true
      this.bridge.send({ cmd: 'RestorePurchases' })
      setTimeout(() => { this.restoring = false }, 3000)
    }
  }
}
</script>

<style scoped>
.subscription-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  backdrop-filter: blur(4px);
}

.subscription-modal {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #2d3748);
  border-radius: 16px;
  max-width: 560px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  padding: 20px 24px 14px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-secondary, #718096);
}

.close-btn:hover {
  color: var(--text-primary, #2d3748);
}

.modal-content {
  padding: 22px 24px;
}

.already-premium {
  text-align: center;
  padding: 24px 0;
}

.premium-check {
  width: 42px;
  height: 42px;
  color: #10b981;
}

.features {
  margin-bottom: 22px;
}

.features h3 {
  font-size: 17px;
  margin: 0 0 16px;
}

.features ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.features li {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
  align-items: flex-start;
}

.feature-icon {
  width: 22px;
  height: 22px;
  color: var(--primary-color, #eb5205);
  flex-shrink: 0;
  margin-top: 2px;
}

.features li strong {
  display: block;
  margin-bottom: 3px;
}

.features li p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #718096);
}

.plans {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}

.plan-card {
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 16px 10px;
  text-align: center;
  position: relative;
}

.plan-card.recommended {
  border-color: var(--primary-color, #eb5205);
}

.plan-card h4 {
  margin: 0;
  font-size: 15px;
}

.best-value {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--primary-color, #eb5205);
  color: #ffffff;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.purchase-btn {
  width: 100%;
  padding: 14px;
  background: var(--primary-color, #eb5205);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.purchase-btn:disabled {
  opacity: 0.75;
  cursor: default;
}

.restore-btn {
  width: 100%;
  margin-top: 10px;
  padding: 11px;
  background: transparent;
  color: var(--text-secondary, #718096);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.restore-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.managed-note {
  text-align: center;
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #718096);
}

.free-tier-info {
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary, #718096);
  padding: 10px;
  background: var(--bg-color, #f8f6f2);
  border-radius: 8px;
}

@media (prefers-color-scheme: dark) {
  .subscription-modal {
    background: var(--card-bg, #2a2a2a);
    color: #e6e6e6;
  }

  .free-tier-info {
    background: rgba(255, 255, 255, 0.04);
  }
}
</style>
