<template>
  <div class="session-sidebar">
    <div
      class="tag-filter"
      data-testid="filter-all"
      :class="{'active-tag': activeTag===''}"
      @click="setActiveTag('')"
    >
      <b>{{ lang.all }}</b>
    </div>
    
    <div
      class="tag-filter upper-border"
      data-testid="filter-untagged"
      :class="{'active-tag': activeTag==='untagged'}"
      @click="setActiveTag('untagged')"
    >
      {{ lang.untagged }}
    </div>
    
    <div
      class="tag-filter upper-border"
      v-for="tag in tags"
      :key="tag"
      :data-testid="`filter-${tag}`"
      :class="{'active-tag': activeTag===tag}"
      @click="setActiveTag(tag)"
    >{{tag}}</div>
    
    <div class="stats" data-testid="session-stats">
      <transition name="fade" mode="out-in">
        <div class="stat-item" :key="sessionCount">{{ sessionCount }} {{ sessionCount === 1 ? (lang.session || 'session') : (lang.sessions || 'sessions') }}</div>
      </transition>
      <transition name="fade" mode="out-in">
        <div class="stat-item" :key="tabCount">{{ tabCount }} {{ tabCount === 1 ? (lang.tab || 'tab') : (lang.tabs || 'tabs') }}</div>
      </transition>
    </div>
    
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  name: "SessionSidebar",
  computed: {
    ...mapState(["lang", "activeTag"]),
    ...mapGetters(["tags", "displaySessions"]),
    sessionCount() {
      return this.displaySessions ? this.displaySessions.length : 0
    },
    tabCount() {
      if (!this.displaySessions) return 0
      return this.displaySessions.reduce((total, session) => {
        return total + (session.sites ? session.sites.length : 0)
      }, 0)
    }
  },
  methods: {
    setActiveTag(tag) {
      this.$store.commit("setActiveTag", tag)
    }
  }
};
</script>

<style scoped>
.session-sidebar {
  width: 110px;
  margin-right: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tag-filter {
  background-color: transparent;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #666);
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-filter:hover {
  background-color: rgba(0, 0, 0, 0.06);
  color: var(--text-primary, #333);
}

.active-tag {
  background-color: salmon;
  color: white !important;
  font-weight: 600;
}

.active-tag:hover {
  background-color: #e07060;
}

.stats {
  margin-top: 16px;
  padding: 12px 12px 0 12px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.stat-item {
  font-size: 12px;
  color: var(--text-secondary, #888);
  line-height: 1.8;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.upper-border {
  /* Remove border separator, use gap instead */
}

@media (prefers-color-scheme: dark) {
  .tag-filter {
    color: #999;
  }

  .tag-filter:hover {
    background-color: rgba(255, 255, 255, 0.08);
    color: #e0e0e0;
  }

  .active-tag {
    background-color: rgba(250, 128, 114, 0.9);
  }

  .active-tag:hover {
    background-color: rgba(224, 112, 96, 0.9);
  }
}
</style>
