<template>
  <div class="session-sidebar">
    <button
      type="button"
      class="tag-filter system-tag"
      data-testid="filter-all"
      :class="{'active-tag': activeTag===''}"
      @click="setActiveTag('')"
    >
      <v-icon class="system-tag-icon" name="layers" :stroke-width="1.8"></v-icon>
      <b>{{ lang.all }}</b>
    </button>

    <button
      type="button"
      class="tag-filter system-tag"
      v-if="hasFavorites"
      data-testid="filter-@Favorite"
      :class="{'active-tag': activeTag==='@Favorite'}"
      @click="setActiveTag('@Favorite')"
    >
      <v-icon class="system-tag-icon" name="star" :stroke-width="1.8"></v-icon>
      {{ lang.favorite }}
    </button>

    <button
      type="button"
      class="tag-filter system-tag upper-border"
      data-testid="filter-untagged"
      :class="{'active-tag': activeTag==='untagged'}"
      @click="setActiveTag('untagged')"
    >
      <v-icon class="system-tag-icon" name="circle" :stroke-width="1.8"></v-icon>
      {{ lang.untagged }}
    </button>

    <button
      type="button"
      class="tag-filter system-tag trash-tag"
      v-if="hasTrash"
      data-testid="filter-@Trash"
      :class="{'active-tag': activeTag==='@Trash'}"
      @click="setActiveTag('@Trash')"
    >
      <v-icon class="system-tag-icon" name="trash-2" :stroke-width="1.8"></v-icon>
      {{ lang.trashBin }}
    </button>

    <button
      type="button"
      class="tag-filter upper-border"
      v-for="tag in userTags"
      :key="tag"
      :data-testid="`filter-${tag}`"
      :class="{'active-tag': activeTag===tag}"
      @click="setActiveTag(tag)"
    >{{tag}}</button>

    <div class="stats" data-testid="session-stats" aria-live="polite">
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
import { matchingSiteEntries } from '../search'

export default {
  name: "SessionSidebar",
  computed: {
    ...mapState(["lang", "activeTag", "keyword"]),
    ...mapGetters(["tags", "displaySessions"]),
    userTags() {
      return this.tags.filter(tag => tag !== "@Favorite" && tag !== "@Trash")
    },
    hasFavorites() {
      return this.tags.includes("@Favorite")
    },
    hasTrash() {
      return this.tags.includes("@Trash")
    },
    sessionCount() {
      return this.displaySessions ? this.displaySessions.length : 0
    },
    tabCount() {
      if (!this.displaySessions) return 0
      return this.displaySessions.reduce((total, session) => {
        if (this.keyword && this.keyword.trim()) {
          return total + matchingSiteEntries(session, this.keyword).length
        }
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
  flex: 0 0 110px;
  margin-right: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* Rides along as the session list scrolls. `align-self` is what makes this
     work at all: a stretched flex item has no slack to stick within. */
  position: sticky;
  top: 16px;
  align-self: flex-start;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.tag-filter {
  background-color: transparent;
  border: 0;
  font: inherit;
  text-align: left;
  /* Without this a short window squeezes every filter thinner instead of
     scrolling the rail, since column flex items shrink before they overflow. */
  flex-shrink: 0;
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
  flex-shrink: 0;
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

.system-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.system-tag-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

@media (max-width: 700px) {
  .session-sidebar {
    flex: 0 0 100%;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    margin-right: 0;
    margin-bottom: 12px;
    gap: 4px;
    /* Stacked layout: the filters sit above the list, so pinning them would
       just eat the screen. */
    position: static;
    max-height: none;
    overflow: visible;
  }

  .tag-filter {
    padding: 6px 12px;
    border-radius: 999px;
  }

  .stats {
    display: flex;
    gap: 12px;
    margin-top: 0;
    margin-left: auto;
    padding: 0 4px;
    border-top: 0;
  }
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
