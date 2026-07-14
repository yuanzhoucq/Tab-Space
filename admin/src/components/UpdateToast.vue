<template>
  <transition name="update-toast">
    <div v-if="visible" class="update-toast" role="status">
      <span class="update-toast-text">{{lang.updateReady}}</span>
      <button class="update-toast-refresh" @click="refresh">{{lang.refresh}}</button>
      <button class="update-toast-close" :aria-label="lang.cancel" @click="visible = false">
        <v-icon name="x"></v-icon>
      </button>
    </div>
  </transition>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: "UpdateToast",
  data() {
    return {
      visible: false
    }
  },
  computed: mapState(["lang"]),
  mounted() {
    window.addEventListener('tabspace:sw-update-ready', this.show)
  },
  beforeDestroy() {
    window.removeEventListener('tabspace:sw-update-ready', this.show)
  },
  methods: {
    show() {
      this.visible = true
    },
    refresh() {
      window.location.reload()
    }
  }
}
</script>

<style scoped>
.update-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 0.85rem;
  color: var(--text-primary);
}

.update-toast-text {
  font-weight: 500;
}

.update-toast-refresh {
  border: none;
  padding: 5px 12px;
  border-radius: var(--radius-md);
  background-color: var(--primary-color);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.update-toast-refresh:hover {
  opacity: 0.85;
}

.update-toast-close {
  border: none;
  background: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.update-toast-close .icon {
  width: 16px;
}

.update-toast-enter-active,
.update-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.update-toast-enter,
.update-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
