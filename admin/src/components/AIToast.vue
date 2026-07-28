<template>
  <transition name="ai-toast-fade">
    <div v-if="aiToast" class="ai-toast" role="status">
      <!-- Tells at a glance whether the toast reports a failure or just an
           outcome, before the sentence is read. -->
      <v-icon class="ai-toast-icon" :class="{'ai-toast-icon-alert': aiToast.retry}"
              :name="aiToast.retry ? 'alert-circle' : 'info'" aria-hidden="true"></v-icon>
      <span class="ai-toast-msg">{{ message }}</span>
      <button v-if="aiToast.retry" type="button" class="ai-toast-retry" @click="retry">
        {{ lang.retry || 'Retry' }}
      </button>
      <button type="button" class="ai-toast-close" :aria-label="lang.cancel || 'Close'" @click="dismiss">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'AiToast',
  data() {
    return { autoDismissTimer: null }
  },
  computed: {
    ...mapState(['lang', 'bridge', 'aiToast']),
    message() {
      if (!this.aiToast) return ''
      return this.lang[this.aiToast.messageKey] || this.aiToast.messageKey
    }
  },
  watch: {
    aiToast(toast) {
      clearTimeout(this.autoDismissTimer)
      if (toast) {
        this.autoDismissTimer = setTimeout(() => this.dismiss(), 6000)
      }
    }
  },
  beforeDestroy() {
    clearTimeout(this.autoDismissTimer)
  },
  methods: {
    dismiss() {
      this.$store.commit('setAIToast', null)
    },
    retry() {
      const retry = this.aiToast && this.aiToast.retry
      this.dismiss()
      if (!retry || !this.bridge) return
      // Re-arm the matching loading state so the affected card spins again.
      if (retry.cmd === 'EnhanceSession') this.$store.commit('setEnhancingSessionId', retry.uuid)
      if (retry.cmd === 'ClusterTabs') this.$store.commit('setSplittingSessionId', retry.uuid)
      this.bridge.send(retry)
    }
  }
}
</script>

<style scoped>
.ai-toast {
  position: fixed;
  left: 50%;
  /* Clears the navbar, so a transient message never covers its menus. */
  top: 56px;
  transform: translateX(-50%);
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 92vw;
  padding: 12px 14px 12px 16px;
  border-radius: 10px;
  background: #2d2d2d;
  color: #f5f5f5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  font-size: 14px;
}

.ai-toast-icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.75);
  stroke: currentColor !important;
}

.ai-toast-icon-alert {
  color: #ffb4a2;
}

.ai-toast-msg {
  flex: 1;
}

.ai-toast-retry {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #ffffff;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.ai-toast-retry:hover {
  background: rgba(255, 255, 255, 0.12);
}

.ai-toast-close {
  background: transparent;
  border: 0;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  padding: 2px;
}

.ai-toast-close svg {
  width: 15px;
  height: 15px;
}

.ai-toast-fade-enter-active,
.ai-toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ai-toast-fade-enter,
.ai-toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
