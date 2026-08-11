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
        <!-- Status strip. Pro sees this instead of a dead end, because Settings
             can now open this dialog at any tier. -->
        <div v-if="isPremium" class="status-note is-active" data-testid="pro-active-message">
          <v-icon name="check-circle" class="status-icon"></v-icon>
          <p>{{ lang.alreadyPremium || "You're on Tab Space Pro." }}</p>
        </div>

        <div v-else-if="hasPermanentPlus" class="status-note" data-testid="plus-owned-message">
          <v-icon name="check-circle" class="status-icon"></v-icon>
          <div>
            <div class="plus-title">
              <strong>{{ lang.planPlus || 'Plus · Permanent' }}</strong>
              <del v-if="plusDisplayPrice"
                   class="plus-price"
                   data-testid="modal-plus-price">{{ plusDisplayPrice }}</del>
            </div>
            <p>{{ lang.plusOwnedSummary || 'Unlimited sessions and all core features are yours permanently. You also receive 5 AI requests each week; Pro makes AI unlimited.' }}</p>
          </div>
        </div>

        <div v-else-if="subscriptionModalReason === 'allowanceExhausted'"
             class="status-note"
             data-testid="session-allowance-exhausted-message">
          <v-icon name="check-circle" class="status-icon"></v-icon>
          <p>{{ lang.freeSessionAllowanceUsed || 'Session saved. Your Free session allowance is now used; upgrade to save another.' }}</p>
        </div>

        <plan-comparison></plan-comparison>

        <template v-if="!isPremium">
          <!-- The selected cycle is handed to the host paywall; final localized
               pricing and purchase confirmation still live in the app.
               aria-pressed is bound as a string on purpose: Vue 2 removes an
               attribute whose bound value is `false`, which would leave the
               unselected card with no pressed state for screen readers. -->
          <div class="plans">
            <button type="button"
                    class="plan-card"
                    :class="{ selected: selectedProductId === monthlyProductId }"
                    :aria-pressed="String(selectedProductId === monthlyProductId)"
                    data-testid="plan-monthly"
                    @click="selectProduct(monthlyProductId)">
              <h4>{{ lang.planMonthly || 'Monthly' }}</h4>
            </button>
            <button type="button"
                    class="plan-card recommended"
                    :class="{ selected: selectedProductId === yearlyProductId }"
                    :aria-pressed="String(selectedProductId === yearlyProductId)"
                    data-testid="plan-yearly"
                    @click="selectProduct(yearlyProductId)">
              <div class="best-value">{{ lang.planRecommended || 'Best value' }}</div>
              <h4>{{ lang.planYearly || 'Yearly' }}</h4>
              <small>{{ lang.annualTrial || '7-day free trial' }}</small>
            </button>
          </div>

          <button type="button" class="purchase-btn" data-testid="subscription-submit"
                  :disabled="purchaseRedirecting" @click="subscribe">
            <span v-if="purchaseRedirecting">{{ lang.continueInApp || 'Continuing in the Tab Space app…' }}</span>
            <span v-else>{{ lang.subscribeInApp || 'Subscribe in Tab Space' }}</span>
          </button>
        </template>

        <button v-else type="button" class="purchase-btn standalone" data-testid="modal-manage-subscription"
                :disabled="purchaseRedirecting" @click="manageSubscription">
          <span v-if="purchaseRedirecting">{{ lang.continueInApp || 'Continuing in the Tab Space app…' }}</span>
          <span v-else>{{ lang.manageSubscription || 'Manage subscription' }}</span>
        </button>

        <button type="button" class="restore-btn" :disabled="restoring || purchaseRedirecting" @click="restore">
          {{ restoring ? (lang.restoring || 'Restoring…') : (lang.restorePurchases || 'Restore Purchases') }}
        </button>

        <p class="managed-note">{{ lang.subscriptionManagedInApp || 'Plans and payment are handled securely in the Tab Space app.' }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import PlanComparison from './PlanComparison'

export default {
  name: 'SubscriptionModal',
  components: { PlanComparison },
  data() {
    return {
      restoring: false,
      monthlyProductId: 'tabspace.pro.monthly',
      yearlyProductId: 'tabspace.pro.yearly',
      selectedProductId: 'tabspace.pro.yearly'
    }
  },
  computed: {
    ...mapState(['lang', 'bridge', 'showSubscriptionModal', 'subscriptionModalReason', 'plusDisplayPrice', 'purchaseRedirecting']),
    ...mapGetters(['isPremium', 'hasPermanentPlus'])
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
    selectProduct(productId) {
      if (productId === this.monthlyProductId || productId === this.yearlyProductId) {
        this.selectedProductId = productId
      }
    },
    // Management, like purchasing, is owned by the host app: the native side
    // brings it forward and replies PurchaseResult { redirected: true }.
    manageSubscription() {
      if (!this.bridge) return
      this.bridge.send({ cmd: 'PurchaseSubscription' })
    },
    subscribe() {
      if (!this.bridge) return
      // Purchases run in the host app now (design §5.2). The native side replies
      // PurchaseResult { redirected: true }, which flips purchaseRedirecting.
      this.bridge.send({
        cmd: 'PurchaseSubscription',
        productId: this.selectedProductId
      })
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

.status-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  margin-bottom: 16px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.1);
}

.status-note p {
  margin: 4px 0 0;
  color: var(--text-secondary, #718096);
  font-size: 13px;
}

.status-note.is-active p {
  margin: 0;
  align-self: center;
  color: var(--text-primary, #2d3748);
  font-size: 14px;
  font-weight: 500;
}

.status-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 1px;
  color: #10b981;
}

.plus-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.plus-price {
  color: var(--text-secondary, #718096);
  font-size: 13px;
  font-weight: 500;
  opacity: 0.8;
}

.plans {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 26px 0 18px;
}

.plan-card {
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 16px 10px;
  text-align: center;
  position: relative;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.plan-card:hover {
  background: rgba(250, 128, 114, 0.08);
}

.plan-card:focus-visible {
  outline: 2px solid var(--primary-color, #fa8072);
  outline-offset: 2px;
}

.plan-card.selected {
  border-color: var(--primary-color, #fa8072);
  background: rgba(250, 128, 114, 0.12);
  box-shadow: 0 0 0 1px var(--primary-color, #fa8072);
}

.plan-card h4 {
  margin: 0;
  font-size: 15px;
}

.plan-card small {
  display: block;
  margin-top: 5px;
  color: var(--text-secondary, #718096);
}

.best-value {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--primary-color, #fa8072);
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
  background: var(--primary-color, #fa8072);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

/* No plan picker above it, so it needs its own separation from the table. */
.purchase-btn.standalone {
  margin-top: 22px;
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

@media (prefers-color-scheme: dark) {
  .subscription-modal {
    background: var(--card-bg, #2a2a2a);
    color: #e6e6e6;
  }
}
</style>
