<template>
  <div class="sessions-list" :data-session-view-mode="sessionViewMode">
    <nav
        v-if="paginationEnabled"
        class="session-pagination"
        data-testid="session-pagination"
        :aria-label="lang.sessions"
    >
      <button
          type="button"
          class="session-pagination-button"
          data-testid="pagination-previous"
          :disabled="currentPage === 1 || paginationLocked"
          :aria-label="lang.previousPage"
          :title="lang.previousPage"
          @click="goToPage(currentPage - 1)"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <span class="session-pagination-range" data-testid="pagination-range" aria-live="polite">
        {{ pageStart + 1 }}–{{ pageEnd }} / {{ displaySessions.length }}
      </span>
      <button
          type="button"
          class="session-pagination-button"
          data-testid="pagination-next"
          :disabled="currentPage === pageCount || paginationLocked"
          :aria-label="lang.nextPage"
          :title="lang.nextPage"
          @click="goToPage(currentPage + 1)"
      >
        <span aria-hidden="true">›</span>
      </button>
    </nav>
    <template v-if="displaySessions.length===0">
      <!-- Only for an empty filter result; the "no sessions at all" case is covered
           by the getting-started empty state in Admin.vue. -->
      <div v-if="sessions.length > 0" class="session-placeholder">{{ lang.nothingHere }}</div>
    </template>
    <div v-else-if="titlesOnlyView" class="session titles-only-card" data-testid="titles-only-session-card">
      <transition-group tag="div" name="session">
        <div
            v-for="session in renderedSessions"
            :key="session.uuid"
            class="titles-only-session"
            :data-testid="`session-${session.uuid}`"
          @click="toggleTitlesOnlySession(session.uuid)"
        >
          <div class="titles-only-session-summary">
            <button
                type="button"
                class="titles-only-session-expand-hit-area"
                data-testid="toggle-titles-only-session"
                :title="expandedSessionUuid === session.uuid ? lang.collapseSession : lang.expandSession"
                :aria-label="expandedSessionUuid === session.uuid ? lang.collapseSession : lang.expandSession"
                :aria-expanded="expandedSessionUuid === session.uuid ? 'true' : 'false'"
                @click.stop="toggleTitlesOnlySession(session.uuid)"
                @keydown.enter.stop.prevent="toggleTitlesOnlySession(session.uuid)"
                @keydown.space.stop.prevent="toggleTitlesOnlySession(session.uuid)"
            ></button>
            <span
                class="titles-only-session-title"
                :contenteditable="editingTitleUuid === session.uuid"
                @click.stop="startTitleEditing(session, $event)"
                @blur="finishTitleEditing(session, $event)"
                @keydown.enter.prevent="$event.currentTarget.blur()"
            >{{ sessionDisplayTitle(session) }}</span>
            <span class="titles-only-session-spacer" aria-hidden="true"></span>
            <span class="titles-only-session-count" data-testid="titles-only-session-count">
              {{ session.sites.length }} {{ session.sites.length === 1 ? (lang.tab || 'tab') : (lang.tabs || 'tabs') }}
            </span>
            <!-- Same AI actions the expanded cards offer; a collapsed row is
                 where they are most useful, since the titles are what AI edits.
                 Open stays last so the row ends on the primary action. -->
            <button
                v-if="aiEnabled"
                type="button"
                class="titles-only-session-btn titles-only-ai-btn"
                data-testid="ai-enhance-session"
                :class="{'loading': enhancingSessionId === session.uuid}"
                :title="lang.aiEnhance || 'AI Enhance'"
                :aria-label="lang.aiEnhance || 'AI Enhance'"
                @click.stop.prevent="enhanceWithAI(session)"
            >
              <v-icon :name="enhancingSessionId === session.uuid ? 'loader' : 'zap'"
                      :class="{'spinner': enhancingSessionId === session.uuid}"></v-icon>
            </button>
            <button
                v-if="aiEnabled && session.sites.length >= 3"
                type="button"
                class="titles-only-session-btn titles-only-ai-btn"
                data-testid="ai-split-session"
                :class="{'loading': splittingSessionId === session.uuid}"
                :title="lang.splitSession || 'Split Topics'"
                :aria-label="lang.splitSession || 'Split Topics'"
                @click.stop.prevent="splitSession(session)"
            >
              <v-icon :name="splittingSessionId === session.uuid ? 'loader' : 'server'"
                      :class="{'spinner': splittingSessionId === session.uuid}"></v-icon>
            </button>
            <button
                type="button"
                class="titles-only-session-btn"
                data-testid="restore-session"
                :title="lang.restore || 'Open'"
                :aria-label="lang.restore || 'Open'"
                @click.stop.prevent="restoreSession(session)"
            >
              <v-icon name="external-link"></v-icon>
            </button>
          </div>
          <transition name="titles-only-expand">
            <div
              v-if="expandedSessionUuid === session.uuid"
              class="titles-only-session-details"
              data-testid="titles-only-session-details"
            >
              <div class="titles-only-session-details-clip">
                <session-card
                    :session="session"
                    :showTagBtns="true"
                    :embedded="true"
                    @click.native.stop
                ></session-card>
              </div>
            </div>
          </transition>
        </div>
      </transition-group>
    </div>
    <!-- A sliced DOM cannot safely use the complete session array as a
         vuedraggable list: page-local indexes would mutate the wrong global
         entries. Large libraries therefore keep all card actions but omit
         session reordering until a cross-page ordering interaction exists. -->
    <div v-else-if="paginationEnabled" class="paginated-session-cards" data-testid="paginated-session-cards">
      <!-- Pagination already bounds the expensive content. Deferring it again
           creates one IntersectionObserver per card, and replacing a page then
           spends seconds tearing down and recreating hundreds of observers. -->
      <session-card v-for="session in renderedSessions" :key="session.uuid" :session="session"
        :defer-expanded-content="false"
        :session-reorder-enabled="false"
        :showTagBtns="hoverId===session.uuid" @mouseenter.native="setHoverId(session.uuid)" @mouseleave.native="() => hoverId=null"
      ></session-card>
    </div>
    <draggable
        v-else
        handle=".handle"
        :list="displaySessions"
        :disabled="hasSearch"
        :supportPointer="false"
        @end="endDragSession"
    >
      <transition-group
          tag="div"
          name="session"
          v-bind:css="false"
          v-on:before-enter="beforeEnter"
          v-on:enter="enter"
          v-on:leave="leave"
      >
        <session-card v-for="session in displaySessions" :key="session.uuid" :session="session"
          :showTagBtns="hoverId===session.uuid" @mouseenter.native="setHoverId(session.uuid)" @mouseleave.native="() => hoverId=null"
        ></session-card>
      </transition-group>
    </draggable>
  </div>
</template>

<script>
  import Velocity from 'velocity-animate'
  import Draggable from 'vuedraggable';
  import { mapState, mapGetters } from 'vuex'

  import SessionCard from './SessionCard';

  const paginationSessionThreshold = 1000
  const sessionPageSize = 250

  export default {
    name: "Sessions",
    components: {
      Draggable,
      SessionCard,
    },
    data() {
      return {
        hoverId: null,
        expandedSessionUuid: null,
        editingTitleUuid: null,
        originalSessionTitle: "",
        currentPage: 1,
      }
    },
    computed: {
      ...mapState([
        "lang",
        "bridge",
        "sessions",
        "activeTag",
        "keyword",
        "sessionViewMode",
        "editingSessionUuid",
        "enhancingSessionId",
        "splittingSessionId"
      ]),
      ...mapGetters(["displaySessions", "aiEnabled"]),
      hasSearch() {
        return Boolean(this.keyword && this.keyword.trim())
      },
      paginationEnabled() {
        return this.displaySessions.length >= paginationSessionThreshold
      },
      pageCount() {
        if (!this.paginationEnabled) return 1
        return Math.max(1, Math.ceil(this.displaySessions.length / sessionPageSize))
      },
      pageStart() {
        return (this.currentPage - 1) * sessionPageSize
      },
      pageEnd() {
        return Math.min(this.pageStart + sessionPageSize, this.displaySessions.length)
      },
      renderedSessions() {
        if (!this.paginationEnabled) return this.displaySessions
        return this.displaySessions.slice(this.pageStart, this.pageEnd)
      },
      paginationLocked() {
        return Boolean(this.editingSessionUuid || this.editingTitleUuid)
      },
      titlesOnlyView() {
        return this.sessionViewMode === "titles" && !this.hasSearch
      }
    },
    watch: {
      displaySessions(sessions) {
        if (this.activeTag && sessions.length === 0) this.$store.commit("setActiveTag", "")
        const nextPageCount = sessions.length >= paginationSessionThreshold
          ? Math.max(1, Math.ceil(sessions.length / sessionPageSize))
          : 1
        if (this.currentPage > nextPageCount) this.currentPage = nextPageCount
        if (sessions.some(session => typeof session.uuid === "string" && session.uuid.startsWith("new-"))) {
          this.currentPage = 1
        }
        const pageStart = (this.currentPage - 1) * sessionPageSize
        const visibleSessions = sessions.length >= paginationSessionThreshold
          ? sessions.slice(pageStart, pageStart + sessionPageSize)
          : sessions
        if (!visibleSessions.some(session => session.uuid === this.expandedSessionUuid)) this.expandedSessionUuid = null
      },
      keyword() {
        this.currentPage = 1
      },
      activeTag() {
        this.currentPage = 1
      },
      titlesOnlyView(enabled) {
        if (!enabled) this.expandedSessionUuid = null
      }
    },
    mounted() {
      document.addEventListener('keydown', e => {
        if (e.code === 'Enter') {
          e.preventDefault()
          e.target.blur()
        }
      })
    },
    methods: {
      goToPage(page) {
        if (this.paginationLocked) return
        const nextPage = Math.min(Math.max(1, page), this.pageCount)
        if (nextPage === this.currentPage) return
        this.currentPage = nextPage
        this.hoverId = null
        this.expandedSessionUuid = null
        this.$nextTick(() => {
          if (this.$el && typeof this.$el.scrollIntoView === "function") {
            this.$el.scrollIntoView({ block: "start" })
          }
        })
      },
      sessionDisplayTitle(session) {
        return session.title || `${this.lang.saveAt} ${(new Date(Number(session.timestamp))).Format('yyyy-MM-dd hh:mm')}`
      },
      toggleTitlesOnlySession(uuid) {
        if (this.editingTitleUuid) return
        this.expandedSessionUuid = this.expandedSessionUuid === uuid ? null : uuid
      },
      startTitleEditing(session, event) {
        this.editingTitleUuid = session.uuid
        this.originalSessionTitle = session.title
        this.$nextTick(() => {
          const title = event.currentTarget
          title.focus()
          const selection = window.getSelection()
          selection.removeAllRanges()
          const range = document.createRange()
          range.selectNodeContents(title)
          selection.addRange(range)
        })
      },
      finishTitleEditing(session, event) {
        const nextTitle = event.currentTarget.innerText.trim()
        this.editingTitleUuid = null
        if (!nextTitle) {
          event.currentTarget.innerText = this.originalSessionTitle || this.sessionDisplayTitle(session)
          return
        }
        if (nextTitle === session.title) return
        session.title = nextTitle
        this.bridge.send({ cmd: 'UpdateSession', bookmarks: [session] })
      },
      restoreSession(session) {
        const currentSession = this.sessions.find(item => item.uuid === session.uuid) || session
        this.bridge.send({ cmd: 'RestoreSession', bookmarks: [currentSession] })
      },
      // Quota and premium gating live on the native/server side and in the
      // split preview, so these mirror the card buttons exactly.
      enhanceWithAI(session) {
        if (!this.aiEnabled || this.enhancingSessionId) return
        this.$store.commit('setEnhancingSessionId', session.uuid)
        this.bridge.send({ cmd: 'EnhanceSession', uuid: session.uuid, bookmarks: [session] })
      },
      splitSession(session) {
        if (!this.aiEnabled || this.splittingSessionId) return
        this.$store.commit('setSplittingSessionId', session.uuid)
        this.bridge.send({ cmd: 'ClusterTabs', uuid: session.uuid, bookmarks: [session] })
      },
      setHoverId(uuid) {
        this.hoverId=uuid
      },
      endDragSession(e) {
        if (e.newIndex !== e.oldIndex) {
          let targetSessionId = this.displaySessions[e.newIndex].uuid
          let prevSessionId = targetSessionId // while moving target to bottom
          if (e.newIndex < this.displaySessions.length - 1) { 
            prevSessionId = this.displaySessions[e.newIndex + 1].uuid
          }
          this.bridge.send({
            cmd: 'MoveSession',
            uuids: [targetSessionId, prevSessionId]
          })
        }
      },
      // List animation
      beforeEnter: function (el) {
        el.style.opacity = 0
      },
      enter(el, done) {
        Velocity(
          el,
          { opacity: 1 },
          { complete: done }
        )
      },
      leave(el, done) {
        el.style.display = 'none'
        Velocity(
          el,
          { opacity: 0 },
          { complete: done }
        )
      }
    }
  };
</script>

<style scoped>
  .sessions-list {
    flex: 1;
    min-width: 0;
  }

  .session-placeholder {
    text-align: center;
    margin-top: 60px;
    color: #555555;
    transition: 0.3s;
  }

  .session-pagination {
    position: sticky;
    z-index: 4;
    top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: max-content;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 auto 12px;
    padding: 5px 8px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 999px;
    color: var(--text-secondary, #718096);
    background: var(--card-bg, rgba(255, 255, 255, 0.96));
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.08));
  }

  .session-pagination-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: inherit;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    background: transparent;
  }

  .session-pagination-button:hover:not(:disabled),
  .session-pagination-button:focus-visible {
    color: var(--text-primary, #2d3748);
    background: rgba(0, 0, 0, 0.06);
  }

  .session-pagination-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .session-pagination-range {
    min-width: 120px;
    padding: 0 8px;
    text-align: center;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .titles-only-card {
    width: 100%;
    box-sizing: border-box;
    margin: 0 auto 16px;
    padding: 6px 18px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px);
    background-color: var(--card-bg, white);
    box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
  }

  .titles-only-session {
    min-width: 0;
    padding: 8px 4px;
  }

  .titles-only-card .session-move {
    transition: transform 0.2s ease-out;
  }

  .titles-only-session + .titles-only-session {
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  .titles-only-session-summary {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 30px;
  }

  .titles-only-session-expand-hit-area {
    position: absolute;
    z-index: 0;
    inset: -4px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    outline: none;
    background: transparent;
    cursor: default;
    transition: background-color 0.15s ease-out, box-shadow 0.15s ease-out;
  }

  .titles-only-session-summary:hover .titles-only-session-expand-hit-area {
    background-color: rgba(0, 0, 0, 0.035);
  }

  .titles-only-session-expand-hit-area:focus-visible {
    box-shadow: 0 0 0 2px var(--primary-color, #fa8072);
  }

  .titles-only-session-details {
    display: grid;
    grid-template-rows: 1fr;
    min-width: 0;
    overflow: hidden;
    transition: grid-template-rows 0.2s ease-out;
  }

  .titles-only-session-details-clip {
    min-height: 0;
    overflow: hidden;
  }

  .titles-only-expand-enter,
  .titles-only-expand-leave-to {
    grid-template-rows: 0fr;
  }

  .titles-only-session-title {
    position: relative;
    z-index: 1;
    display: block;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 15px;
    font-weight: 400;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .titles-only-session-title:hover {
    text-decoration: underline;
    cursor: text;
  }

  .titles-only-session-title[contenteditable="true"] {
    flex: 1;
    outline: none;
    border-radius: 3px;
    box-shadow: 0 0 0 2px var(--primary-color, #fa8072);
    white-space: normal;
  }

  .titles-only-session-spacer {
    position: relative;
    z-index: 1;
    align-self: stretch;
    flex: 1;
    min-width: 12px;
  }

  .titles-only-session-count {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    margin: 0 10px;
    color: var(--text-secondary, #718096);
    font-size: 12px;
    white-space: nowrap;
  }

  .titles-only-session-btn {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    color: var(--text-secondary, #718096);
    cursor: pointer;
    background: transparent;
  }

  .titles-only-session-btn:hover {
    color: var(--text-primary, #2d3748);
    background-color: rgba(0, 0, 0, 0.06);
  }

  .titles-only-session-btn svg {
    width: 16px;
    height: 16px;
    stroke: currentColor !important;
  }

  /* Same colour coding as the expanded cards: enhance is gold, split is purple.
     The colour has to land on the icon itself — the shared `.icon` rule sets
     `color` there, which is what its `stroke: currentColor` resolves against. */
  .titles-only-ai-btn[data-testid="ai-enhance-session"] svg {
    color: #eab308;
  }

  .titles-only-ai-btn[data-testid="ai-enhance-session"]:hover svg {
    color: #ca8a04;
  }

  .titles-only-ai-btn[data-testid="ai-enhance-session"]:hover {
    background-color: rgba(234, 179, 8, 0.1);
  }

  .titles-only-ai-btn[data-testid="ai-split-session"] svg {
    color: #8b5cf6;
  }

  .titles-only-ai-btn[data-testid="ai-split-session"]:hover svg {
    color: #7c3aed;
  }

  .titles-only-ai-btn[data-testid="ai-split-session"]:hover {
    background-color: rgba(139, 92, 246, 0.1);
  }

  .titles-only-ai-btn.loading {
    pointer-events: none;
  }

  .titles-only-ai-btn .spinner {
    animation: titles-only-spin 1s linear infinite;
  }

  @keyframes titles-only-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (prefers-color-scheme: dark) {
    .session-placeholder {
      color: #bdbdbd;
    }

    .titles-only-card {
      color: #d0d0d0;
      border-color: #3a3a3a;
      background-color: var(--card-bg, #2a2a2a);
    }

    .session-pagination {
      border-color: #3a3a3a;
      color: #bdbdbd;
      background: rgba(42, 42, 42, 0.96);
    }

    .session-pagination-button:hover:not(:disabled),
    .session-pagination-button:focus-visible {
      color: #f7fafc;
      background: rgba(255, 255, 255, 0.08);
    }

    .titles-only-session-btn:hover {
      color: var(--text-primary, #f7fafc);
      background-color: rgba(255, 255, 255, 0.08);
    }

    .titles-only-ai-btn[data-testid="ai-enhance-session"] svg {
      color: #facc15;
    }

    .titles-only-ai-btn[data-testid="ai-enhance-session"]:hover svg {
      color: #fde047;
    }

    .titles-only-ai-btn[data-testid="ai-enhance-session"]:hover {
      background-color: rgba(250, 204, 21, 0.15);
    }

    .titles-only-ai-btn[data-testid="ai-split-session"] svg {
      color: #a78bfa;
    }

    .titles-only-ai-btn[data-testid="ai-split-session"]:hover svg {
      color: #c4b5fd;
    }

    .titles-only-ai-btn[data-testid="ai-split-session"]:hover {
      background-color: rgba(167, 139, 250, 0.15);
    }

    .titles-only-session-summary:hover .titles-only-session-expand-hit-area {
      background-color: rgba(255, 255, 255, 0.045);
    }
  }
</style>
