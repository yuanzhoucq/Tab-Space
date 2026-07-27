<template>
  <div class="session-hub">
      <button
          v-if="aiEnabled && activeTag !== '@Trash'"
          type="button"
          class="hub-btn organize-btn"
          data-testid="organize-library"
          :aria-label="organizeLabel"
          :title="organizeLabel"
          @click="openSuggestionReport">
          <svg
              class="button organize-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true">
              <path class="organize-wand" d="M4.5 19.5 15 9m-2.5-2.5 5 5"></path>
              <path class="organize-sparkle organize-sparkle-main" d="M18.5 1.8 19.4 4l2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9.9-2.2Z"></path>
              <path class="organize-sparkle" d="m7 3 .55 1.45L9 5l-1.45.55L7 7l-.55-1.45L5 5l1.45-.55L7 3Z"></path>
          </svg>
          <span
              v-if="suggestions.length > 0"
              class="organize-badge"
              data-testid="organize-suggestion-count"
              aria-hidden="true">
              {{ suggestionCount }}
          </span>
      </button>
      <button type="button" class="hub-btn" data-testid="add-session" :aria-label="lang.newSession" :title="lang.newSession" @click="insertSession">
          <v-icon class="button" :stroke-width="1.2" name="plus-circle" fill="rgba(250, 128, 114, 0.2)"
      stroke="salmon"></v-icon>
      </button>
      <button type="button" class="hub-btn" data-testid="toggle-collapse" :data-view-mode="sessionViewMode" :aria-label="lang.collapseSessions" :title="lang.collapseSessions" @click="toggleCollapse">
          <v-icon class="button" :stroke-width="1.5" :name="viewModeIcon"
      stroke="salmon" style="width:26px;margin-left:2px"></v-icon>
      </button>
      <button type="button" class="hub-btn" data-testid="empty-trash" :aria-label="lang.emptyTrash" :title="lang.emptyTrash" @click="emptyTrash" v-if="activeTag === '@Trash'">
          <v-icon class="button" :stroke-width="1.2" name="trash" fill="rgba(235, 82, 5, 0.2)"
      stroke="rgb(235, 82, 5)"></v-icon>
      </button>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
export default {
    computed: {
      ...mapState(["lang", "bridge", "sessions", "sessionViewMode", "activeTag", "keyword", "editingSessionUuid", "suggestions"]),
      ...mapGetters(["displaySessions", "aiEnabled"]),
      viewModeIcon() {
          if (this.sessionViewMode === "titles") return "minimize"
          if (this.sessionViewMode === "compact") return "maximize"
          return "align-justify"
      },
      suggestionCount() {
          return this.suggestions.length > 99 ? "99+" : this.suggestions.length
      },
      organizeLabel() {
          if (this.suggestions.length === 0) {
              return this.lang.suggestionReportTitle || "Cleanup report"
          }
          const template = this.lang.suggestionViewAll || "View all {count} suggestions"
          return template.replace("{count}", this.suggestions.length)
      }
    },
    methods: {
        insertSession() {
            if (this.editingSessionUuid) return
            if (this.sessionViewMode === "titles") this.$store.commit("setSessionViewMode", "expanded")
            if (this.keyword) this.$store.commit("setKeyword", "")
            let timestamp = (new Date()).getTime()
            let newSession = {
                uuid: "new-" + timestamp,
                title: "",
                timestamp,
                sites: [],
                tags: this.activeTag ? [{name: this.activeTag}] : []
            }
            this.$store.commit("spliceSessions", {start: 0, deleteCount: 0, items: [newSession]})
            this.$nextTick(() => {
                this.$store.commit("setEditingSessionUuid", newSession.uuid)
            })
        },
        toggleCollapse() {
            this.$store.commit("toggleCollapse")
        },
        openSuggestionReport() {
            this.$store.commit("setShowSuggestionReport", true)
        },
        emptyTrash() {
            this.bridge.send({ cmd: "DeleteSession", bookmarks: this.sessions.filter(s => s.tags.map(t => t.name).includes("@Trash")) })
        }
    }
}
</script>

<style scoped>
.session-hub {
    margin-left: 15px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    transition: 0.3s;
}

.hub-btn {
    background: transparent;
    border: 0;
    padding: 0;
    display: block;
}

.organize-btn {
    position: relative;
}

.organize-badge {
    position: absolute;
    bottom: -3px;
    right: -5px;
    min-width: 15px;
    height: 15px;
    box-sizing: border-box;
    padding: 0 4px;
    border: 2px solid var(--bg-color, #f8f6f2);
    border-radius: 999px;
    background: var(--primary-color, #fa8072);
    color: #ffffff;
    font-size: 9px;
    font-weight: 700;
    line-height: 11px;
    text-align: center;
}

.button {
    width: 30px;
    cursor: pointer;
}

.organize-icon {
    width: 28px;
    height: 28px;
    margin-left: 1px;
}

.organize-wand {
    stroke: var(--primary-color, #fa8072);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.organize-sparkle {
    fill: rgba(124, 109, 242, 0.14);
    stroke: #7c6df2;
    stroke-width: 1.25;
    stroke-linejoin: round;
}

.organize-sparkle-main {
    stroke-width: 1.4;
}

.button:hover {
    opacity: 0.7;
}
</style>
