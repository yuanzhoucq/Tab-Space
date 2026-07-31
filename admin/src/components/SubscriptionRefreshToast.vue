<template>
  <transition name="subscription-refresh-toast">
    <div v-if="showSubscriptionRefreshPrompt"
         class="subscription-refresh-toast"
         role="status"
         data-testid="subscription-refresh-toast">
      <span class="subscription-refresh-toast-text">
        {{ lang.subscriptionActivationPending || 'Subscribed in the Tab Space app? Reload the dashboard to start using it.' }}
      </span>
      <button type="button"
              class="subscription-refresh-toast-refresh"
              data-testid="subscription-refresh-reload"
              @click="reload">
        {{ lang.refresh || 'Refresh' }}
      </button>
      <button type="button"
              class="subscription-refresh-toast-close"
              :aria-label="lang.cancel || 'Close'"
              @click="dismiss">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'SubscriptionRefreshToast',
  computed: mapState(['lang', 'showSubscriptionRefreshPrompt']),
  methods: {
    // The bridge only raises this prompt after re-checking the status has
    // stopped helping, so reloading is the remaining action, not one of several.
    reload() {
      window.location.reload()
    },
    dismiss() {
      this.$store.commit('setShowSubscriptionRefreshPrompt', false)
    }
  }
}
</script>

<style scoped>
.subscription-refresh-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  /* Above the subscription dialog: the prompt is raised while that dialog can
     still be open, waiting on a purchase that already went through. */
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(420px, 92vw);
  padding: 10px 12px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 0.85rem;
  color: var(--text-primary);
}

.subscription-refresh-toast-text {
  font-weight: 500;
}

.subscription-refresh-toast-refresh {
  border: none;
  padding: 5px 12px;
  border-radius: var(--radius-md);
  background-color: var(--primary-color);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.subscription-refresh-toast-refresh:hover {
  opacity: 0.85;
}

.subscription-refresh-toast-close {
  border: none;
  background: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.subscription-refresh-toast-close .icon {
  width: 16px;
}

.subscription-refresh-toast-enter-active,
.subscription-refresh-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.subscription-refresh-toast-enter,
.subscription-refresh-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
