<template>
  <div class="session-hub">
      <!-- No Feather glyph describes the compact view, so it gets a drawn one:
           a session title with its favicon strip underneath, twice over. -->
      <svg class="view-mode-glyph-defs" width="0" height="0" aria-hidden="true" focusable="false">
          <symbol id="tabspace-view-compact" viewBox="0 0 24 24">
              <path d="M4 4.2h13.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
              <circle cx="4.8" cy="9" r="1.15" fill="currentColor"></circle>
              <circle cx="9.2" cy="9" r="1.15" fill="currentColor"></circle>
              <circle cx="13.6" cy="9" r="1.15" fill="currentColor"></circle>
              <path d="M4 15h13.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
              <circle cx="4.8" cy="19.8" r="1.15" fill="currentColor"></circle>
              <circle cx="9.2" cy="19.8" r="1.15" fill="currentColor"></circle>
              <circle cx="13.6" cy="19.8" r="1.15" fill="currentColor"></circle>
          </symbol>
      </svg>
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
      <!-- The trigger shows which view is active and cycles on click; hovering
           names the three views so the control is not icon-only guesswork. -->
      <div class="hub-btn view-mode" data-testid="view-mode-menu">
          <button type="button" class="view-mode-trigger" data-testid="toggle-collapse"
                  :data-view-mode="sessionViewMode"
                  :aria-label="viewModeTriggerLabel" :title="viewModeTriggerLabel"
                  @click="toggleCollapse">
              <svg v-if="activeViewMode.glyph" class="button view-mode-glyph view-mode-trigger-glyph" viewBox="0 0 24 24" aria-hidden="true">
                  <use :href="`#${activeViewMode.glyph}`"></use>
              </svg>
              <v-icon v-else class="button" :stroke-width="1.5" :name="viewModeIcon"
          stroke="salmon" style="width:26px;margin-left:2px"></v-icon>
          </button>
          <div class="view-mode-dropdown">
              <div class="view-mode-panel">
                  <button
                      v-for="mode in viewModes"
                      :key="mode.id"
                      type="button"
                      class="view-mode-option"
                      :class="{'view-mode-option-active': sessionViewMode === mode.id}"
                      :data-testid="`view-mode-${mode.id}`"
                      :aria-pressed="sessionViewMode === mode.id ? 'true' : 'false'"
                      @click="setViewMode(mode.id, $event)">
                      <svg v-if="mode.glyph" class="view-mode-option-icon view-mode-glyph" viewBox="0 0 24 24" aria-hidden="true">
                          <use :href="`#${mode.glyph}`"></use>
                      </svg>
                      <v-icon v-else class="view-mode-option-icon" :stroke-width="1.6" :name="mode.icon"></v-icon>
                      <span>{{ mode.label }}</span>
                  </button>
              </div>
          </div>
      </div>
      <button type="button" class="hub-btn" data-testid="empty-trash" :aria-label="lang.emptyTrash" :title="lang.emptyTrash" @click="emptyTrash" v-if="activeTag === '@Trash'">
          <v-icon class="button" :stroke-width="1.2" name="trash" fill="rgba(235, 82, 5, 0.2)"
      stroke="rgb(235, 82, 5)"></v-icon>
      </button>
      <!-- Last in the rail: the new session lands at the top of the list, so the
           button sits away from the controls that act on what is already there. -->
      <button type="button" class="hub-btn" data-testid="add-session" :aria-label="lang.newSession" :title="lang.newSession" @click="insertSession">
          <v-icon class="button" :stroke-width="1.2" name="plus-circle" fill="rgba(250, 128, 114, 0.2)"
      stroke="salmon"></v-icon>
      </button>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
export default {
    computed: {
      ...mapState(["lang", "bridge", "sessions", "sessionViewMode", "activeTag", "keyword", "editingSessionUuid", "suggestions"]),
      ...mapGetters(["displaySessions", "aiEnabled", "canCreateSession"]),
      // Each view keeps its own icon, so the button reads as "you are here"
      // instead of an unlabelled cycle. The icons describe a row of the list:
      // favicon plus title, the favicon strip on its own, then title only.
      viewModes() {
          return [
              { id: "expanded", icon: "list", label: this.lang.viewExpanded },
              { id: "compact", glyph: "tabspace-view-compact", label: this.lang.viewCompact },
              { id: "titles", icon: "menu", label: this.lang.viewTitles }
          ]
      },
      activeViewMode() {
          return this.viewModes.find(mode => mode.id === this.sessionViewMode) || this.viewModes[0]
      },
      viewModeIcon() {
          return this.activeViewMode.icon
      },
      viewModeTriggerLabel() {
          return `${this.lang.collapseSessions}: ${this.activeViewMode.label}`
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
            // Free is capped, and the native side would refuse the save anyway:
            // offer the upgrade instead of an editor that cannot be stored.
            if (!this.canCreateSession) {
                this.$store.commit("setShowSubscriptionModal", true)
                return
            }
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
        setViewMode(mode, event) {
            this.$store.commit("setSessionViewMode", mode)
            // A pointer click leaves focus on the option, and `:focus-within`
            // then pins the menu open on top of the list. Keyboard activation
            // (detail === 0) keeps its focus, since that is the only way back.
            if (event && event.detail > 0 && event.currentTarget) event.currentTarget.blur()
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
    /* Stays reachable while the session list scrolls past. `align-self` is what
       makes this work at all: a stretched flex item has no slack to stick.
       Sticky also opens a stacking context, so the rail has to outrank the
       z-index a hovered card takes — otherwise the card covers this menu. */
    position: sticky;
    top: 16px;
    align-self: flex-start;
    z-index: 60;
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

.view-mode {
    position: relative;
}

.view-mode-trigger {
    background: transparent;
    border: 0;
    padding: 0;
    display: block;
}

.view-mode-glyph-defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
}

/* The drawn glyph inherits its colour, so it matches whichever context it sits
   in — salmon on the rail, the option's own colour in the menu. */
.view-mode-glyph {
    color: currentColor;
}

.view-mode-trigger-glyph {
    width: 26px;
    height: 26px;
    margin-left: 2px;
    color: salmon;
}

/* The wrapper reaches all the way back to the trigger and pads the gap, so the
   pointer never crosses dead space on its way to the options. Hiding is delayed
   for the same reason: leaving by a hair should not close the menu. */
.view-mode-dropdown {
    position: absolute;
    top: -10px;
    right: 100%;
    z-index: 100;
    padding: 10px 8px 10px 0;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease, visibility 0s linear 0.35s;
}

.view-mode:hover .view-mode-dropdown,
.view-mode:focus-within .view-mode-dropdown {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.12s ease, visibility 0s linear 0s;
}

.view-mode-panel {
    min-width: 150px;
    padding: 4px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    background-color: var(--card-bg, #ffffff);
    box-shadow: 0 8px 24px rgba(45, 55, 72, 0.16);
}

.view-mode-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 7px 9px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-primary, #2d3748);
    font: inherit;
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}

.view-mode-option:hover {
    background-color: rgba(0, 0, 0, 0.06);
}

.view-mode-option-active {
    color: var(--primary-color, #eb5205);
    font-weight: 600;
}

.view-mode-option-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: currentColor;
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

@media (max-width: 700px) {
    .view-mode-dropdown {
        top: 100%;
        right: auto;
        left: -10px;
        padding: 8px 0 10px 10px;
    }
}

@media (prefers-color-scheme: dark) {
    .view-mode-panel {
        border-color: #3a3a3a;
        background-color: var(--card-bg, #2a2a2a);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    .view-mode-option {
        color: #e6e6e6;
    }

    .view-mode-option:hover {
        background-color: rgba(255, 255, 255, 0.08);
    }

    .view-mode-option-active {
        color: #ff9b8f;
    }
}
</style>
