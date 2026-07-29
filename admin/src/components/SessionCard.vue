<template>
  <div :class="[embedded ? 'embedded-session' : 'session', {'session-editing': isEditingSession(session)}]"
      :id="embedded ? null : session.uuid"
      :data-testid="embedded ? 'embedded-session-content' : `session-${session.uuid}`"
      @click="handleCardClick"
      @keydown="handleSessionEditKeydown($event, session)">
    <div v-if="!embedded" class="session-header">
      <div class="session-header-left">
        <div class="tag-btn handle" v-if="showTagBtns && activeTag === '' && !hasSearch && !bulkSelectionMode && !isEditingSession(session)" :title="lang.movePrompt">
          <v-icon name="align-justify" :stroke-width="1.8" style="margin-left:1px"></v-icon>
        </div>
        <input
            v-if="isEditingSession(session)"
            ref="sessionTitleInput"
            class="session-title-edit"
            data-testid="session-title-input"
            v-model="session.title"
            type="text"
            :placeholder="lang.sessionTitle"
            :aria-label="lang.sessionTitle">
        <div
            v-else
            class="session-title"
            :class="{'ai-updated': aiFlash}"
            :id="'id'+session.uuid"
            @click.stop="editSessionName(session.uuid)"
            @blur="updateSessionName"
        >
          <span v-if="typewriterActive" class="typewriter">{{ typewriterText }}<span class="cursor">|</span></span>
          <template v-else>
            <span
                v-for="(part, index) in highlightParts(session.title || (`${lang.saveAt} ${(new Date(Number(session.timestamp))).Format('yyyy-MM-dd hh:mm')}`))"
                :key="index"
                :class="{'highlight': part.match}"
            >{{ part.text }}</span>
          </template>
        </div>
        <!-- In search results the match count doubles as the expander, so the
             card needs no separate expand button. -->
        <button v-if="hasSearch"
                type="button"
                class="search-match-count"
                data-testid="search-match-count"
                :data-expander="canToggleTemporaryExpansion ? 'true' : 'false'"
                :aria-expanded="temporarilyExpanded ? 'true' : 'false'"
                :aria-label="temporaryExpansionLabel"
                :title="temporaryExpansionLabel"
                @click.stop="toggleTemporaryExpansion">
          {{ searchResultEntries.length }} / {{ session.sites.length }}
          {{ session.sites.length === 1 ? (lang.tab || 'tab') : (lang.tabs || 'tabs') }}
        </button>
      </div>
      <div class="session-header-right">
        <template v-if="isEditingSession(session)">
          <button
              type="button"
              class="btn edit-cancel-btn"
              data-testid="cancel-session-edit"
              @click.stop="cancelSessionEdit(session)"
              :title="lang.cancel"
              :aria-label="lang.cancel">
            <v-icon name="x" class="btn-icon"></v-icon>
          </button>
          <button
              type="button"
              class="btn edit-save-btn"
              data-testid="save-session"
              @click.stop="saveSessionEdit(session)"
              :title="lang.saveChanges"
              :aria-label="lang.saveChanges">
            <v-icon name="check" class="btn-icon"></v-icon>
            <span>{{ lang.saveChanges }}</span>
          </button>
        </template>
        <button v-if="bulkSelectionMode"
                type="button" class="btn" data-testid="cancel-bulk-select"
                @click.stop="cancelBulkSelection"
                :title="lang.cancel" :aria-label="lang.cancel">
          <v-icon name="x" class="btn-icon"></v-icon>
        </button>
        <button v-if="!bulkSelectionMode && !isEditingSession(session)" type="button" class="btn" data-testid="restore-session" @click.stop="restore(session.uuid, true, false)"
                :title="lang.openSession || 'Open'" :aria-label="lang.openSession || 'Open'">
          <v-icon name="external-link" class="btn-icon"></v-icon>
        </button>
        <button v-if="aiEnabled && !bulkSelectionMode && !isEditingSession(session)"
                type="button" class="btn ai-btn" data-testid="ai-enhance-session"
                :class="{ 'loading': enhancingSessionId === session.uuid }"
                :title="lang.aiEnhance || 'AI Enhance'" :aria-label="lang.aiEnhance || 'AI Enhance'"
                @click.stop="enhanceWithAI(session)">
          <v-icon v-if="enhancingSessionId === session.uuid" name="loader" class="btn-icon spinner"></v-icon>
          <v-icon v-else name="zap" class="btn-icon"></v-icon>
        </button>
        <button v-if="aiEnabled && session.sites.length >= 3 && !bulkSelectionMode && !isEditingSession(session)"
                type="button" class="btn split-btn" data-testid="ai-split-session"
                :class="{ 'loading': splittingSessionId === session.uuid }"
                :title="lang.splitSession || 'Split Topics'" :aria-label="lang.splitSession || 'Split Topics'"
                @click.stop="splitSession(session)">
          <v-icon v-if="splittingSessionId === session.uuid" name="loader" class="btn-icon spinner"></v-icon>
          <v-icon v-else name="server" class="btn-icon"></v-icon>
        </button>
        <button v-if="!bulkSelectionMode && !isEditingSession(session)"
                type="button" class="btn del-btn" data-testid="delete-session"
                @click.stop="restore(session.uuid, false, true)"
                :title="lang.deleteSession || 'Delete'" :aria-label="lang.deleteSession || 'Delete'">
          <v-icon name="trash-2" class="btn-icon"></v-icon>
        </button>
        <div v-if="activeTag !== '@Trash' && !bulkSelectionMode && !isEditingSession(session)" class="export" data-testid="export-session-menu">
          <button type="button" class="btn" :title="lang.exportSession || 'Export'" :aria-label="lang.exportSession || 'Export'">
            <v-icon name="share-2" class="btn-icon"></v-icon>
          </button>
          <export-dropdown :selectedSessions="[session]"></export-dropdown>
        </div>
      </div>
    </div>
    <ul
        :class="['session-sites', {'collapsed-sites': compactView, 'editing-sites': isEditingSession(session)}]"
        data-testid="site-list"
        :data-site-drag-enabled="canDragSites ? 'true' : 'false'"
        v-bind="collapsedExpanderAttrs"
        @keydown="handleCollapsedRowKeydown">
      <!-- Kept outside <draggable>: a `v-if` element in the draggable's header
           slot leaves an empty placeholder vnode at the front of the default
           slot, which shifts every index vuedraggable maps back onto
           `session.sites` — dragged tabs then resolve to the wrong site (or to
           `undefined`, silently dropping the move). -->
      <li
          v-if="isEditingSession(session)"
          class="site-editor-columns"
          aria-hidden="true">
        <span></span>
        <span>URL</span>
        <span>{{ lang.tabTitle }}</span>
        <span></span>
      </li>
      <draggable
          :disabled="!canDragSites"
          :force-fallback="true"
          :fallback-on-body="true"
          :fallback-tolerance="10"
          fallback-class="site-drag-fallback"
          :list="session.sites"
          group="shared"
          @start="() => startDragSite(session)"
          @end="endDragSite">
        <li
          v-for="(entry, visibleIndex) in visibleSiteEntries"
          v-bind:key="`${session.uuid}-${entry.originalIndex}`"
          :class="{
            'collapsed-site': compactView,
            'bulk-selectable-site': bulkSelectionMode,
            'bulk-selected-site': isSiteSelected(entry.originalIndex),
            'editing-site-row': isEditingSession(session)
          }"
          :style="compactView ? { zIndex: visibleIndex + 1 } : null"
          :data-testid="compactView ? 'collapsed-site-icon' : 'visible-site'"
          @click="bulkSelectionMode && toggleSiteSelection(entry.originalIndex)"
        >
          <button
              v-if="bulkSelectionMode"
              type="button"
              class="bulk-site-checkbox"
              data-testid="select-site"
              :aria-label="`${lang.selectTabs}: ${entry.site.title || entry.site.url}`"
              :aria-pressed="isSiteSelected(entry.originalIndex) ? 'true' : 'false'"
              @click.stop="toggleSiteSelection(entry.originalIndex)">
            <v-icon :name="isSiteSelected(entry.originalIndex) ? 'check-square' : 'square'"></v-icon>
          </button>
          <div v-if="isEditingSession(session)" class="site-editor">
            <span class="site-editor-index" aria-hidden="true">{{ entry.originalIndex + 1 }}</span>
            <div class="site-edit-field">
              <input
                  class="tab-edit"
                  data-testid="edit-site-url"
                  placeholder="https://"
                  aria-label="URL"
                  type="text"
                  v-model="entry.site.url">
            </div>
            <div class="site-edit-field">
              <input
                  class="tab-edit"
                  data-testid="edit-site-title"
                  :placeholder="lang.tabTitle"
                  :aria-label="lang.tabTitle"
                  type="text"
                  v-model="entry.site.title">
            </div>
            <button
                type="button"
                class="remove-edit-site"
                data-testid="remove-edit-site"
                @click.stop="removeEditedSite(entry.originalIndex)"
                :title="lang.delete"
                :aria-label="lang.delete">
              <v-icon name="trash-2"></v-icon>
            </button>
          </div>
          <div v-if="!isEditingSession(session) && !compactView && !bulkSelectionMode" class="del-item" @click="delItem(entry.originalIndex,session)" >
            <v-icon name="x" :stroke-width="2" size="14"></v-icon>
          </div>
          <div v-if="!isEditingSession(session)" :class="['fav', {'collapsed-fav': compactView}]">
            <img
                :class="['fav-img', {'collapsed-fav-img': compactView}]"
                :src="getFavicon(entry.site.url)"
                :onerror="`src='${WangYeIcon}'`"
                alt
            />
          </div>
          <span v-if="!isEditingSession(session) && !compactView && bulkSelectionMode" class="site-title bulk-site-title">
            {{ entry.site.title || entry.site.url }}
          </span>
          <span v-if="!isEditingSession(session) && !compactView && !bulkSelectionMode" class="site-title">
            <span v-if="tabSpaceSettings['remove-site-after-click'] === 'true'" class="link"
            @click="() => removeAndOpen(entry.originalIndex, session, entry.site.url)">
              <span
                  v-for="(part, index) in highlightParts(entry.site.title || entry.site.url)"
                  :key="index"
                  :class="{'highlight': part.match}"
              >{{ part.text }}</span>
            </span>
            <a v-else class="link" :href="wrapUrl(entry.site.url)">
              <span
                  v-for="(part, index) in highlightParts(entry.site.title || entry.site.url)"
                  :key="index"
                  :class="{'highlight': part.match}"
              >{{ part.text }}</span>
            </a>
            <span v-if="hasSearch && entry.site.title && entry.site.url" class="site-url">
              <span
                  v-for="(part, index) in highlightParts(entry.site.url)"
                  :key="index"
                  :class="{'highlight': part.match}"
              >{{ part.text }}</span>
            </span>
          </span>
        </li>
        <li
          slot="footer"
          v-if="compactView && !isEditingSession(session) && collapsedOverflowCount > 0"
          class="collapsed-site collapsed-site-overflow"
          :style="{ zIndex: collapsedVisibleLimit + 1 }"
          data-testid="collapsed-site-overflow"
        >
          +{{ collapsedOverflowCount }}
        </li>
        <li slot="footer" v-if="isEditingSession(session)" class="add-edit-site-row">
          <button type="button" class="add-edit-site" data-testid="add-edit-site" @click="addEditedSite">
            <v-icon name="plus"></v-icon>
            <span>{{ lang.addTab }}</span>
          </button>
        </li>
      </draggable>
    </ul>
    <div v-if="bulkSelectionMode" class="bulk-move-bar" data-testid="bulk-move-bar">
      <div class="bulk-selection-copy">
        <div class="bulk-selection-summary">
          <button type="button" class="bulk-text-button" data-testid="toggle-select-all" @click="toggleSelectAllSites">
            {{ allSitesSelected ? lang.deselectAllTabs : lang.selectAllTabs }}
          </button>
          <span data-testid="selected-tabs-count">{{ selectedTabsLabel }}</span>
          <button v-if="embedded" type="button" class="bulk-text-button" data-testid="cancel-bulk-select" @click="cancelBulkSelection">
            {{ lang.cancel }}
          </button>
        </div>
        <span v-if="allSitesSelected" class="bulk-merge-hint" data-testid="bulk-merge-hint">
          {{ lang.mergeIncludesTags }}
        </span>
      </div>
      <div class="bulk-move-controls">
        <select
            class="bulk-move-target"
            data-testid="bulk-move-target"
            v-model="bulkMoveTargetUuid"
            :aria-label="bulkActionTargetLabel">
          <option disabled value="">{{ bulkActionTargetLabel }}</option>
          <option v-for="target in bulkMoveTargets" :key="target.uuid" :value="target.uuid">
            {{ sessionDisplayTitle(target) }} · {{ target.sites.length }} {{ target.sites.length === 1 ? lang.tab : lang.tabs }}
          </option>
        </select>
        <button
            type="button"
            class="bulk-move-submit"
            data-testid="bulk-move-submit"
            :disabled="selectedSiteIndexes.length === 0 || !bulkMoveTargetUuid"
            @click="moveSelectedSites">
          {{ allSitesSelected ? lang.mergeSelectedSession : lang.moveSelectedTabs }}
        </button>
      </div>
    </div>
    <div v-if="!bulkSelectionMode" class="session-tags">
      <div
          class="tag"
          :class="{'search-tag': hasSearch || isEditingSession(session)}"
          v-for="tag in visibleTags(session)"
          @click="hasSearch || isEditingSession(session) ? null : removeTag(tag.name, session)"
          v-bind:key="tag.name"
          :title="tag.name === '@Trash' ? (lang.restore || '') : ''"
      >
        <span
            v-for="(part, index) in highlightParts(tag.name === '@Trash' ? lang.trashBin : tag.name)"
            :key="index"
            :class="{'highlight': part.match}"
        >{{ part.text }}</span>
      </div>
      <button type="button" class="tag-btn" data-testid="add-tag" :title="lang.tagPrompt" :aria-label="lang.tagPrompt"
              v-if="!hasSearch && !isEditingSession(session) && tagEditorId !== session.uuid" @click="e => addTag(e, session.uuid)">
        <v-icon name="tag" style="margin-bottom: -4px" :stroke-width="1.5"></v-icon>
      </button>
      <div v-if="tagEditorId === session.uuid" class="tag-autocomplete">
        <input
            ref="tagInput"
            :id="tagInputId"
            data-testid="tag-input"
            v-model="tagKeyword"
            type="text"
            autocomplete="off"
            :placeholder="lang.tagPrompt"
            role="combobox"
            aria-autocomplete="list"
            :aria-expanded="tagSuggestions.length > 0 ? 'true' : 'false'"
            :aria-controls="tagSuggestionListId"
            :aria-activedescendant="activeTagSuggestionId"
            @blur="saveTag"
            @keydown.down.prevent="moveTagSuggestion(1)"
            @keydown.up.prevent="moveTagSuggestion(-1)"
            @keydown.enter.prevent="confirmTag"
            @keydown.esc.prevent="cancelTag">
        <div v-if="tagSuggestions.length > 0" class="tag-suggestions">
          <ul :id="tagSuggestionListId" role="listbox">
            <li
                v-for="(tag, index) in tagSuggestions"
                :id="tagSuggestionId(index)"
                :key="tag"
                role="option"
                :aria-selected="tagSuggestionIndex === index ? 'true' : 'false'"
                :class="{'tag-suggestion-active': tagSuggestionIndex === index}"
                @mouseenter="tagSuggestionIndex = index"
                @mousedown.prevent="chooseTag(tag)">
              <span>{{ tag }}</span>
            </li>
          </ul>
        </div>
      </div>
      <button type="button" class="tag-btn" data-testid="toggle-favorite" v-if="!hasSearch && !isEditingSession(session) && (showTagBtns || isFavorite(session))"
              :aria-label="lang.favorite || 'Favorite'" @click="() => toggleFavorite(session)">
        <v-icon name="star" :stroke-width="1.5"
        :fill="isFavorite(session) ? 'salmon' : 'none'"
        :stroke="isFavorite(session) ? 'salmon' : 'currentColor'"
        ></v-icon>
      </button>
      <div v-if="showTagBtns && !hasSearch && !isEditingSession(session)" style="display: flex; transition: 3s">
        <button type="button" class="tag-btn" data-testid="bulk-select-tabs"
          v-if="canBulkMove" :title="lang.selectTabs" :aria-label="lang.selectTabs"
          @click.stop="beginBulkSelection(false)">
          <v-icon name="check-square" :stroke-width="1.5"></v-icon>
        </button>
        <button type="button" data-testid="edit-session" :title="lang.editPrompt" :aria-label="lang.editPrompt"
        v-if="!embedded && !editingSessionUuid" class="tag-btn"
        @click="startSessionEdit(session)">
          <v-icon name="edit" :stroke-width="1.5"></v-icon>
        </button>
        <button type="button" class="tag-btn" data-testid="pin-session" :title="lang.topPrompt" :aria-label="lang.topPrompt"
        @click.stop.prevent="() => upSession(session)">
          <v-icon name="arrow-up-circle" :stroke-width="1.5"></v-icon>
        </button>
        <button type="button" class="tag-btn" data-testid="merge-session"
          v-if="canBulkMove" :title="lang.mergePrompt" :aria-label="lang.mergePrompt"
          @click.stop="beginBulkSelection(true)">
          <v-icon name="git-merge" :stroke-width="1.8"></v-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
  import { mapState, mapGetters } from 'vuex';
  import { isUnsavedSession } from '../store';

  import WangYeIcon from '../assets/img/icon-webpage.svg';
  import Draggable from 'vuedraggable';
  import ExportDropdown from './ExportDropdown';
  import { highlightedTextParts, matchingSiteEntries } from '../search';

  export default {
    name: "SessionCard",
    components: {
      Draggable,
      ExportDropdown
    },
    props: ["session", "showTagBtns", "embedded"],
    data() {
      return {
        collapsedVisibleLimit: 10,
        tagEditorId: false,
        WangYeIcon: WangYeIcon,
        tagKeyword: "",
        tagSuggestionIndex: -1,
        temporarilyExpanded: false,
        editSnapshot: null,
        editPreviousExpansion: false,
        bulkSelectionMode: false,
        bulkSelectionPreviousExpansion: false,
        selectedSiteIndexes: [],
        bulkMoveTargetUuid: "",
        // AI enhance animation (typewriter title + golden flash)
        typewriterActive: false,
        typewriterText: "",
        typewriterTimer: null,
        aiFlash: false,
        flashTimer: null
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "keyword", "sessionViewMode", "sessions", "activeTag", "editingSessionUuid", "tabSpaceSettings", "enhancingSessionId", "splittingSessionId", "enhancedFlash"]),
      ...mapGetters(["tags", "aiEnabled", "canCreateSession"]),
      hasSearch() {
        return Boolean(this.keyword && this.keyword.trim())
      },
      compactView() {
        return this.sessionViewMode === "compact"
          && !this.hasSearch
          && !this.temporarilyExpanded
          && !this.isEditingSession(this.session)
      },
      canDragSites() {
        // Cross-session dragging requires every session list to be visible as
        // a stable drop target. Collapsed views use bulk move instead.
        return !this.embedded
          && this.sessionViewMode === "expanded"
          && !this.hasSearch
          && !this.isEditingSession(this.session)
          && !this.bulkSelectionMode
      },
      canToggleTemporaryExpansion() {
        if (this.isEditingSession(this.session) || this.bulkSelectionMode) return false
        return this.sessionViewMode === "compact" || this.hasSearch
      },
      // A collapsed card expands by clicking anywhere in its empty space; the
      // favicon row carries the matching keyboard affordance so the card needs
      // no dedicated expand button. Search results use the match count instead,
      // which stays a real button because the list still holds links.
      collapsedExpanderAttrs() {
        if (!this.canToggleTemporaryExpansion || this.hasSearch) return {}
        return {
          role: "button",
          tabindex: "0",
          "data-expander": "true",
          "aria-expanded": this.temporarilyExpanded ? "true" : "false",
          "aria-label": this.temporaryExpansionLabel,
          title: this.temporaryExpansionLabel
        }
      },
      canBulkMove() {
        return !this.hasSearch
          && !this.isEditingSession(this.session)
          && this.activeTag !== "@Trash"
          && this.session.sites.length > 0
          && this.bulkMoveTargets.length > 0
      },
      bulkMoveTargets() {
        return this.sessions.filter(session => (
          session.uuid !== this.session.uuid
          && !session.uuid.startsWith("new-")
          && !session.tags.some(tag => tag.name === "@Trash")
        ))
      },
      allSitesSelected() {
        return this.session.sites.length > 0
          && this.selectedSiteIndexes.length === this.session.sites.length
      },
      selectedTabsLabel() {
        return (this.lang.selectedTabs || "{count} selected")
          .replace("{count}", this.selectedSiteIndexes.length)
      },
      bulkActionTargetLabel() {
        return this.allSitesSelected ? this.lang.mergePrompt : this.lang.moveTabsTo
      },
      temporaryExpansionLabel() {
        return this.temporarilyExpanded
          ? (this.lang.collapseSession || this.lang.collapseSessions)
          : (this.lang.expandSession || this.lang.collapseSessions)
      },
      searchResultEntries() {
        return this.hasSearch ? matchingSiteEntries(this.session, this.keyword) : []
      },
      visibleSiteEntries() {
        const entries = this.session.sites.map((site, originalIndex) => ({ site, originalIndex }))
        if (this.temporarilyExpanded) return entries
        if (this.hasSearch) return this.searchResultEntries
        if (this.compactView) return entries.slice(0, this.collapsedVisibleLimit)
        return entries
      },
      collapsedOverflowCount() {
        return Math.max(0, this.session.sites.length - this.collapsedVisibleLimit)
      },
      editingSessionUuid: {
        get() {
          return this.$store.state.editingSessionUuid
        },
        set(id) {
          this.$store.commit("setEditingSessionUuid", id)
        }
      },
      tagSuggestions() {
        if (!Array.isArray(this.tags)) return []
        const existingTags = new Set(this.session.tags.map(tag => tag.name))
        const keyword = this.tagKeyword.toLowerCase()
        return this.tags.filter(tag => (
          !existingTags.has(tag)
          && this.isSubsequence(keyword, tag.toLowerCase())
        ))
      },
      tagInputId() {
        return `tag-input-${this.session.uuid}`
      },
      tagSuggestionListId() {
        return `tag-suggestions-${this.session.uuid}`
      },
      activeTagSuggestionId() {
        return this.tagSuggestionIndex >= 0 && this.tagSuggestions[this.tagSuggestionIndex]
          ? this.tagSuggestionId(this.tagSuggestionIndex)
          : null
      }
    },
    watch: {
      editingSessionUuid(id) {
        if (id === this.session.uuid) this.prepareSessionEdit(this.session)
      },
      showTagBtns() {
        this.tagEditorId = false
      },
      keyword() {
        if (this.bulkSelectionMode) this.cancelBulkSelection()
        if (this.isEditingSession(this.session)) this.cancelSessionEdit(this.session)
        this.temporarilyExpanded = false
      },
      sessionViewMode() {
        if (this.bulkSelectionMode) this.cancelBulkSelection()
        if (this.isEditingSession(this.session)) this.cancelSessionEdit(this.session)
        this.temporarilyExpanded = false
      },
      tagKeyword() {
        this.tagSuggestionIndex = -1
      },
      enhancedFlash(flash) {
        // The bridge sets this after a successful EnhanceSession; only the
        // matching card plays the reveal animation.
        if (flash && flash.uuid === this.session.uuid) {
          this.runEnhanceAnimation(flash.title)
        }
      }
    },
    beforeDestroy() {
      if (this.typewriterTimer) clearInterval(this.typewriterTimer)
      if (this.flashTimer) clearTimeout(this.flashTimer)
    },
    methods: {
      prepareSessionEdit(session) {
        if (this.embedded || this.editSnapshot) return
        this.editSnapshot = {
          title: session.title,
          sites: session.sites.map(site => ({...site}))
        }
        this.editPreviousExpansion = this.temporarilyExpanded
        this.temporarilyExpanded = true
        this.tagEditorId = false
        if (session.sites.length === 0) session.sites.push({title: "", url: ""})
        this.$nextTick(() => {
          if (this.$refs.sessionTitleInput) this.$refs.sessionTitleInput.focus()
        })
      },
      startSessionEdit(session) {
        if (this.embedded || this.editingSessionUuid) return
        this.prepareSessionEdit(session)
        this.editingSessionUuid = session.uuid
      },
      saveSessionEdit(session) {
        if (!this.isEditingSession(session)) return
        this.editingSessionUuid = false
        this.editSnapshot = null
        this.temporarilyExpanded = this.editPreviousExpansion
        this.updateSession(session)
      },
      cancelSessionEdit(session) {
        if (!this.isEditingSession(session)) return
        const isNewSession = session.uuid.startsWith("new-")
        if (!isNewSession && this.editSnapshot) {
          session.title = this.editSnapshot.title
          session.sites = this.editSnapshot.sites.map(site => ({...site}))
        }
        this.editingSessionUuid = false
        this.editSnapshot = null
        this.temporarilyExpanded = this.editPreviousExpansion
        if (isNewSession) {
          const index = this.sessions.findIndex(item => item.uuid === session.uuid)
          if (index !== -1) {
            this.$store.commit("spliceSessions", {start: index, deleteCount: 1, items: []})
          }
        }
      },
      addEditedSite() {
        if (!this.isEditingSession(this.session)) return
        this.session.sites.push({title: "", url: ""})
      },
      removeEditedSite(index) {
        if (!this.isEditingSession(this.session)) return
        this.session.sites.splice(index, 1)
      },
      handleSessionEditKeydown(event, session) {
        if (!this.isEditingSession(session)) return
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          this.cancelSessionEdit(session)
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.stopPropagation()
          this.saveSessionEdit(session)
        }
      },
      beginBulkSelection(selectAll = false) {
        if (!this.canBulkMove) return
        this.bulkSelectionPreviousExpansion = this.temporarilyExpanded
        this.temporarilyExpanded = true
        this.selectedSiteIndexes = selectAll
          ? this.session.sites.map((site, index) => index)
          : []
        this.bulkMoveTargetUuid = ""
        this.tagEditorId = false
        this.bulkSelectionMode = true
      },
      cancelBulkSelection() {
        this.bulkSelectionMode = false
        this.selectedSiteIndexes = []
        this.bulkMoveTargetUuid = ""
        this.temporarilyExpanded = this.bulkSelectionPreviousExpansion
      },
      isSiteSelected(index) {
        return this.selectedSiteIndexes.includes(index)
      },
      toggleSiteSelection(index) {
        if (!this.bulkSelectionMode || index < 0 || index >= this.session.sites.length) return
        if (this.isSiteSelected(index)) {
          this.selectedSiteIndexes = this.selectedSiteIndexes.filter(selectedIndex => selectedIndex !== index)
        } else {
          this.selectedSiteIndexes = [...this.selectedSiteIndexes, index].sort((a, b) => a - b)
        }
      },
      toggleSelectAllSites() {
        this.selectedSiteIndexes = this.allSitesSelected
          ? []
          : this.session.sites.map((site, index) => index)
      },
      sessionDisplayTitle(session) {
        return session.title || `${this.lang.saveAt} ${(new Date(Number(session.timestamp))).Format('yyyy-MM-dd hh:mm')}`
      },
      moveSelectedSites() {
        if (this.selectedSiteIndexes.length === 0) return
        const source = this.getSessionById(this.session.uuid)
        const target = this.getSessionById(this.bulkMoveTargetUuid)
        if (!source || !target || source.uuid === target.uuid) return

        if (this.allSitesSelected) {
          this.bridge.send({ cmd: "MergeSessions", bookmarks: [target, source] })
          this.cancelBulkSelection()
          return
        }

        const selectedIndexes = new Set(this.selectedSiteIndexes)
        const movingSites = source.sites.filter((site, index) => selectedIndexes.has(index))
        if (movingSites.length === 0) return

        const sourceAfterMove = {
          ...source,
          sites: source.sites.filter((site, index) => !selectedIndexes.has(index))
        }
        const targetAfterMove = {
          ...target,
          sites: [...target.sites, ...movingSites]
        }

        this.moveSitesLegacy(sourceAfterMove, targetAfterMove)
        this.cancelBulkSelection()
      },
      moveSitesLegacy(source, target) {
        // TODO(native-protocol-v2): Prefer an atomic MoveSites command once
        // it is supported broadly. Keep this two-command fallback for older apps.
        this.bridge.send({ cmd: "UpdateSession", bookmarks: [target] })
        this.bridge.send({
          cmd: source.sites.length === 0 ? "DeleteSession" : "UpdateSession",
          bookmarks: [source]
        })
      },
      enhanceWithAI(session) {
        // Free and Plus share the Worker-enforced weekly trial quota.
        if (!this.aiEnabled || this.enhancingSessionId) return
        this.$store.commit("setEnhancingSessionId", session.uuid)
        this.bridge.send({ cmd: "EnhanceSession", uuid: session.uuid, bookmarks: [session] })
      },
      splitSession(session) {
        // Previewing a split consumes the same non-Pro trial quota; applying
        // the split remains gated in SplitPreviewModal.
        if (!this.aiEnabled || this.splittingSessionId) return
        this.$store.commit("setSplittingSessionId", session.uuid)
        this.bridge.send({ cmd: "ClusterTabs", uuid: session.uuid, bookmarks: [session] })
      },
      runEnhanceAnimation(title) {
        this.aiFlash = true
        clearTimeout(this.flashTimer)
        this.flashTimer = setTimeout(() => { this.aiFlash = false }, 2000)
        if (title) this.typeTitle(title)
        // Consume the flash so it does not replay on re-render.
        this.$store.commit("setEnhancedFlash", null)
      },
      typeTitle(fullTitle) {
        if (this.typewriterTimer) clearInterval(this.typewriterTimer)
        this.typewriterActive = true
        this.typewriterText = ""
        let index = 0
        this.typewriterTimer = setInterval(() => {
          if (index < fullTitle.length) {
            this.typewriterText = fullTitle.substring(0, index + 1)
            index++
          } else {
            clearInterval(this.typewriterTimer)
            this.typewriterTimer = null
            setTimeout(() => { this.typewriterActive = false; this.typewriterText = "" }, 400)
          }
        }, 28)
      },
      toggleTemporaryExpansion() {
        this.temporarilyExpanded = !this.temporarilyExpanded
      },
      handleCollapsedRowKeydown(event) {
        if (!this.collapsedExpanderAttrs.role) return
        if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return
        event.preventDefault()
        event.stopPropagation()
        this.toggleTemporaryExpansion()
      },
      // Anything the card already reacts to keeps its own behaviour; the empty
      // space around it toggles the collapsed card open.
      handleCardClick(event) {
        if (!this.canToggleTemporaryExpansion) return
        if (event.target.closest(
          "a, button, input, select, textarea, label, [contenteditable='true'], .tag, .session-title, .del-item, .handle"
        )) return
        this.toggleTemporaryExpansion()
      },
      highlightParts(value) {
        return highlightedTextParts(value, this.keyword)
      },
      isEditingSession(session) {
        return this.editingSessionUuid === session.uuid
      },
      visibleTags(session) {
        // @Favorite is presented by the star button, not as a pill
        return session.tags.filter(t => t.name !== "@Favorite")
      },
      wrapUrl(url) {
        return (url.indexOf("://") === -1) ? "http://" + url : url
      },
      getSessionById(id) {
        return this.sessions.find(session => session.uuid === id)
      },
      removeSessions(sessions) {
        sessions.forEach(session => {
          if (isUnsavedSession(session)) {
            this.$store.commit("spliceSessions", {start: this.sessions.findIndex(s => s.uuid === session.uuid), deleteCount: 1, items: []})
          }
        })
        sessions = sessions.filter(s => !isUnsavedSession(s))
        if (sessions.filter(s => s.sites.length === 0).length > 0)
          this.bridge.send({ cmd: 'DeleteSession', bookmarks: sessions.filter(s => s.sites.length === 0) })
        sessions.filter(s => s.sites.length > 0).forEach(s => {
          if (s.tags.map(t => t.name).includes("@Trash")) this.bridge.send({ cmd: 'DeleteSession', bookmarks: [s] })
          else this.setTag("@Trash", s)
        })
      },
      updateSession(session) {
        // delete session without any sites
        console.log(session)
        session.sites = session.sites.map(site => {
          if (site.url && !site.title) return {url: site.url, title: site.url}
          else return site
        })
        session.sites = session.sites.filter(site => site.title && site.url)
        if (session.sites.length === 0) {
          this.removeSessions([session])
        } else {
          let isNewSession = isUnsavedSession(session)
          if (isNewSession && !this.canCreateSession) {
            // The native side would refuse this session; drop the card here so
            // the dashboard never shows a session that was not stored.
            this.$store.commit("discardUnsavedSessions")
            this.$store.commit("setShowSubscriptionModal", true)
            return
          }
          this.bridge.send({ cmd: isNewSession ? 'AppendSessions' : 'UpdateSession', bookmarks: [session] })
        }
      },
      upSession(session) {
        const currentSession = this.getSessionById(session.uuid) || session
        this.bridge.send({ cmd: 'UpSession', bookmarks: [currentSession]})
      },
      getFavicon(url) {
        try {
          let origin = (new URL(this.wrapUrl(url))).origin
          return origin + "/favicon.ico"
        } catch {
          return ""
        }
      },
      restore(key, open, del) {
        if (open) {
          let session = this.sessions.find(s => s.uuid === key)
          if (session) {
            this.bridge.send({ cmd: 'RestoreSession', bookmarks: [session]})
          }
        }
        if (del) {
          const sessionsToDelete = this.sessions.filter(session => session.uuid === key)
          this.removeSessions(sessionsToDelete)
        }
      },
      editSessionName(id) {
        if (this.hasSearch || this.bulkSelectionMode) return
        this.activeId = id
        const div = document.querySelector(`#id${id}`)
        div.setAttribute('contentEditable', "true")
        div.style.whiteSpace = "normal";
        div.style.minWidth = "150px";
        div.focus()
        this.tmpText = div.innerText
        document.execCommand('selectAll', false, null)
      },
      updateSessionName() {
        const div = document.querySelector(`#id${this.activeId}`)
        div.style.whiteSpace = "nowrap";
        div.style.minWidth = "0";
        let session = this.getSessionById(this.activeId)
        session.title = div.innerText
        if (session.title) this.updateSession(session)
        else div.innerText = this.tmpText
      },
      removeAndOpen(tid, session, url) {
        this.delItem(tid, session)
        window.open(url)
      },
      delItem(tid, session) {
        session.sites.splice(tid, 1)
        this.updateSession(session)
      },
      addTag(e, id) {
        this.tagKeyword = ""
        this.tagSuggestionIndex = -1
        this.tagEditorId = id
        this.$nextTick(() => {
          if (this.$refs.tagInput) this.$refs.tagInput.focus()
        })
      },
      isSubsequence(keyword, candidate) {
        let keywordIndex = 0
        for (let candidateIndex = 0; candidateIndex < candidate.length && keywordIndex < keyword.length; candidateIndex += 1) {
          if (candidate[candidateIndex] === keyword[keywordIndex]) keywordIndex += 1
        }
        return keywordIndex === keyword.length
      },
      tagSuggestionId(index) {
        return `${this.tagSuggestionListId}-${index}`
      },
      moveTagSuggestion(direction) {
        const suggestionCount = this.tagSuggestions.length
        if (suggestionCount === 0) return
        if (this.tagSuggestionIndex === -1) {
          this.tagSuggestionIndex = direction > 0 ? 0 : suggestionCount - 1
          return
        }
        this.tagSuggestionIndex = (
          this.tagSuggestionIndex + direction + suggestionCount
        ) % suggestionCount
      },
      confirmTag() {
        const suggestion = this.tagSuggestions[this.tagSuggestionIndex]
        if (suggestion) {
          this.chooseTag(suggestion)
        } else {
          this.saveTag()
        }
      },
      cancelTag() {
        this.tagKeyword = ""
        this.tagSuggestionIndex = -1
        this.tagEditorId = false
      },
      setTag(tagName, session) {
        if (!tagName || !session) return
        if (!session.tags.map(t => t.name).includes(tagName)) {
          session.tags.push({name: tagName})
        }
        this.tagKeyword = ""
        this.updateSession(session)
      },
      saveTag() {
        const session = this.getSessionById(this.tagEditorId)
        this.setTag(this.tagKeyword, session)
        this.tagSuggestionIndex = -1
        this.tagEditorId = false
      },
      chooseTag(tag) {
        const session = this.getSessionById(this.tagEditorId)
        this.setTag(tag, session)
        this.tagSuggestionIndex = -1
        this.tagEditorId = false
      },
      removeTag(tag, session) {
        session.tags = session.tags.filter(t => t.name !== tag)
        this.updateSession(session)
      },
      isFavorite(session) {
        return Boolean(session.tags.find(t => t.name === "@Favorite"))
      },
      toggleFavorite(session) {
        if (this.isFavorite(session)) {
          session.tags = session.tags.filter(t => t.name !== "@Favorite")
        } else {
          session.tags.push({name: "@Favorite"})
        }
        this.updateSession(session)
      },
      getSessionIdFromDraggingSite(site) {
        return site.parentElement.parentElement.firstElementChild.firstElementChild.lastElementChild.id.slice(2)
      },
      startDragSite(session) {
        // Without a free slot the dropped tabs could not be stored as a new
        // session, and the drag would silently drop them: offer no target.
        if (!this.canCreateSession) {
          this.newSession = null
          return
        }
        let timestamp = (new Date()).getTime()
        this.newSession = {
          uuid: "new-" + timestamp,
          title: "",
          timestamp,
          sites: [],
          tags: this.activeTag ? [{name: this.activeTag}] : []
        }
        this.crtId = this.sessions.findIndex(i => i.uuid === session.uuid)
        this.$store.commit("spliceSessions", {start: this.crtId + 1, deleteCount: 0, items: [this.newSession]})
      },
      endDragSite(e) {
        if (this.newSession && this.newSession.sites.length === 0) this.$store.commit("spliceSessions", {start: this.crtId + 1, deleteCount: 1, items: []})
        const fromId = this.getSessionIdFromDraggingSite(e.from)
        const toId = this.getSessionIdFromDraggingSite(e.to)
        if (fromId === toId) {
          if (e.newIndex !== e.oldIndex) {
            this.updateSession(this.sessions.find(item => item.uuid === fromId))
          }
        } else {
          this.updateSession(this.sessions.find(item => item.uuid === fromId))
          this.updateSession(this.sessions.find(item => item.uuid === toId))
        }
      }
    }
  }
</script>

<style scoped>
  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .session-header-left {
    display: flex;
    align-items: center;
    position: relative;
    min-width: 0;
  }

  .session-header-right {
    display: flex;
    align-items: center;
    white-space: nowrap;
    position: relative;
    z-index: 10;
  }

  .handle {
    position: absolute;
    margin-left: -24px;
    margin-top: 5px;
    display: flex;
    align-items: center;
    cursor: grab !important;
  }

  .session {
    border-radius: var(--radius-lg, 12px);
    text-decoration: none;
    width: 100%;
    box-sizing: border-box;
    margin: 0 auto 16px;
    padding: 14px 18px 10px 28px;
    background-color: var(--card-bg, white);
    border: 1px solid var(--border-color, #e2e8f0);
    box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    position: relative;
  }

  .session:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06));
    z-index: 50;
  }

  .session.session-editing {
    padding: 16px 18px 14px;
    border-color: rgba(184, 69, 43, 0.32);
    box-shadow: 0 12px 32px rgba(45, 55, 72, 0.1);
  }

  .session.session-editing:hover {
    transform: none;
    box-shadow: 0 12px 32px rgba(45, 55, 72, 0.1);
  }

  .session-editing .session-header {
    gap: 12px;
  }

  .session-editing .session-header-left {
    flex: 1;
  }

  .embedded-session {
    padding: 2px 0 0;
  }

  .embedded-session .session-sites {
    margin: 0;
    padding: 2px 0 0 22px;
  }

  .embedded-session .session-tags {
    padding-left: 22px;
  }

  .session-tags {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 6px;
  }

  .tag-autocomplete {
    position: relative;
    display: inline-block;
    margin-bottom: 5px;
  }

  .tag-autocomplete input {
    width: 92px;
    margin: 0 2px;
  }

  .tag-suggestions {
    position: absolute;
    width: 100px;
    margin-top: 3px;
    border-radius: 4px;
    background-color: #f5f5f5;
    z-index: 999;
  }

  .tag-suggestions ul {
    margin: 5px;
    padding-left: 0;
  }

  .tag-suggestions li {
    width: calc(100% - 10px);
    margin-left: -1.8px;
    padding: 3px 3px 3px 10px;
    border-radius: 3px;
    opacity: 0.9;
    cursor: pointer;
    font-size: 12px;
    list-style: none;
  }

  .tag-suggestions li:hover,
  .tag-suggestions .tag-suggestion-active {
    background-color: #ddd;
  }

  .tag {
    background-color: #f0f0f0;
    border: 1px solid #e0e0e0;
    padding: 5px 10px;
    color: #666666;
    font-size: 11px;
    border-radius: 999px;
    margin-right: 5px;
    margin-top: 1px;
    margin-bottom: 5px;
    display: inline-flex;
    align-items: center;
    line-height: 1;
  }

  .tag:hover {
    cursor: pointer;
    text-decoration: line-through;
    opacity: 0.8;
    transition: 0.2s;
  }

  .tag.search-tag:hover {
    cursor: default;
    opacity: 1;
    text-decoration: none;
  }

  .btn-icon {
    color: white;
    width: 14px;
  }

  .tag-btn {
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    opacity: 1;
    margin-right: 4px;
    margin-bottom: 5px;
    width: 20px;
    height: 20px;
    min-height: 20px;
    cursor: pointer;
    transition: 0.6s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tag-btn:hover {
    opacity: 0.7;
    transition: 0.1s;
  }

  @media (prefers-color-scheme: dark) {
    .tag-suggestions {
      background-color: #555555;
    }

    .tag-suggestions li:hover,
    .tag-suggestions .tag-suggestion-active {
      background-color: #777777;
    }
  }

  .session-title {
    font-size: 18px;
    font-weight: bold;
    transition: box-shadow .2s linear;
    box-shadow: inset 0 -10px #fadc23;
    display: inline-block;
    min-height: 22px;
    max-width: 350px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 20px;
  }

  .session-title:hover {
    cursor: pointer;
  }

  .session-title-edit {
    width: 100%;
    max-width: 420px;
    min-width: 160px;
    height: 36px;
    box-sizing: border-box;
    padding: 6px 10px;
    border: 1px solid var(--border-color, #d6dce5);
    border-radius: 8px;
    outline: none;
    color: var(--text-primary, #2d3748);
    font: inherit;
    font-size: 17px;
    font-weight: 650;
    background-color: var(--card-bg, #ffffff);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .session-title-edit:focus {
    border-color: rgba(184, 69, 43, 0.6);
    box-shadow: 0 0 0 3px rgba(250, 128, 114, 0.15);
  }

  .edit-cancel-btn {
    width: 34px;
    height: 34px;
  }

  .btn.edit-save-btn {
    min-height: 34px;
    gap: 5px;
    padding: 6px 12px;
    margin-right: 0;
    color: #ffffff;
    font-size: 12px;
    font-weight: 650;
    background-color: #b8452b;
  }

  .btn.edit-save-btn:hover {
    color: #ffffff;
    background-color: #a63d25;
  }

  .edit-save-btn svg,
  .edit-save-btn .btn-icon,
  .edit-save-btn:hover svg,
  .edit-save-btn:hover .btn-icon {
    stroke: #ffffff !important;
  }

  .search-match-count {
    color: var(--text-secondary, #718096);
    flex-shrink: 0;
    font: inherit;
    font-size: 11px;
    margin-right: 10px;
    padding: 2px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .search-match-count[data-expander="false"] {
    cursor: default;
  }

  .search-match-count[data-expander="true"]:hover {
    background-color: rgba(0, 0, 0, 0.06);
    color: var(--text-primary, #2d3748);
  }

  .search-match-count:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary-color, #fa8072);
  }

  /* Collapsed cards expand from the favicon row, which is also the keyboard
     target for the same action. */
  .session-sites[role="button"] {
    outline: none;
    cursor: pointer;
  }

  .session-sites[role="button"]:focus-visible {
    border-radius: 6px;
    box-shadow: 0 0 0 2px var(--primary-color, #fa8072);
  }

  .site-title {
    flex: 1;
    min-width: 0;
  }

  .bulk-selectable-site {
    cursor: pointer;
  }

  .bulk-selected-site {
    background-color: rgba(250, 128, 114, 0.12);
  }

  .bulk-selected-site:hover {
    background-color: rgba(250, 128, 114, 0.18);
  }

  .bulk-site-checkbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    margin: 0 4px 0 -4px;
    padding: 3px;
    border: 0;
    border-radius: 5px;
    color: var(--text-secondary, #718096);
    cursor: pointer;
    background: transparent;
  }

  .bulk-site-checkbox:hover {
    color: var(--text-primary, #2d3748);
    background-color: rgba(0, 0, 0, 0.06);
  }

  .bulk-site-checkbox svg {
    width: 17px;
    height: 17px;
    stroke: currentColor !important;
  }

  .bulk-selected-site .bulk-site-checkbox {
    color: #b8452b;
  }

  .bulk-site-title {
    padding: 2px 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .site-title .link {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 50px);
  }

  .site-url {
    color: var(--text-secondary, #718096);
    display: block;
    font-size: 11px;
    max-width: calc(100% - 50px);
    overflow: hidden;
    padding: 0 4px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-sites {
    user-select: none; 
    transition: 0.2s;
    margin: 0 0 0 -45px;
  }

  .editing-sites {
    margin: 4px 0 0;
    padding: 0;
  }

  .editing-sites > div {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .site-editor-columns {
    display: grid;
    grid-template-columns: 22px minmax(180px, 1.15fr) minmax(160px, 0.85fr) 28px;
    gap: 8px;
    box-sizing: border-box;
    width: 100%;
    /* Drops the global list-item margins so the labels line up with the rows
       below, and matches that list's row gap. */
    margin: 0 0 5px;
    padding: 0 8px 1px;
    color: var(--text-secondary, #718096);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.04em;
    list-style: none;
    text-transform: uppercase;
  }

  .editing-site-row {
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
    margin: 0;
    padding: 6px 8px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    list-style: none;
    background-color: rgba(113, 128, 150, 0.045);
  }

  .editing-site-row:hover {
    background-color: rgba(113, 128, 150, 0.065);
  }

  .site-editor {
    display: grid;
    grid-template-columns: 22px minmax(180px, 1.15fr) minmax(160px, 0.85fr) 28px;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .site-editor-index {
    align-self: center;
    color: var(--text-secondary, #718096);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .site-edit-field {
    min-width: 0;
  }

  .tab-edit {
    width: 100%;
    height: 31px;
    box-sizing: border-box;
    margin: 0;
    padding: 5px 8px;
    border: 1px solid var(--border-color, #d6dce5);
    border-radius: 7px;
    outline: none;
    color: var(--text-primary, #2d3748);
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    background-color: var(--card-bg, #ffffff);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .tab-edit:focus {
    border-color: rgba(184, 69, 43, 0.6);
    box-shadow: 0 0 0 3px rgba(250, 128, 114, 0.13);
  }

  .remove-edit-site {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 31px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    color: var(--text-secondary, #718096);
    cursor: pointer;
    background: transparent;
  }

  .remove-edit-site:hover {
    color: #eb5205;
    background-color: rgba(235, 82, 5, 0.1);
  }

  .remove-edit-site svg {
    width: 15px;
    height: 15px;
    stroke: currentColor !important;
  }

  .add-edit-site-row {
    margin-top: 2px;
    padding: 0;
    list-style: none;
  }

  .add-edit-site {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 31px;
    padding: 5px 10px;
    border: 1px dashed rgba(184, 69, 43, 0.4);
    border-radius: 8px;
    color: #b8452b;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    background-color: rgba(250, 128, 114, 0.06);
  }

  .add-edit-site:hover {
    border-color: rgba(184, 69, 43, 0.65);
    background-color: rgba(250, 128, 114, 0.12);
  }

  .add-edit-site svg {
    width: 15px;
    height: 15px;
    stroke: currentColor !important;
  }

  .site-drag-fallback {
    border: 1px solid var(--border-color, #e2e8f0);
    background-color: var(--card-bg, #ffffff);
    box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
  }

  .bulk-move-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 8px 0 8px -8px;
    padding: 10px 12px;
    border: 1px solid rgba(184, 69, 43, 0.24);
    border-radius: 8px;
    background-color: rgba(250, 128, 114, 0.08);
  }

  .bulk-selection-summary,
  .bulk-move-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bulk-selection-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .bulk-selection-summary {
    flex-shrink: 0;
    color: var(--text-secondary, #718096);
    font-size: 12px;
  }

  .bulk-merge-hint {
    color: var(--text-secondary, #718096);
    font-size: 11px;
  }

  .bulk-text-button {
    padding: 0;
    border: 0;
    color: #b8452b;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
  }

  .bulk-text-button:hover {
    text-decoration: underline;
  }

  .bulk-move-controls {
    min-width: 0;
    flex: 1;
    justify-content: flex-end;
  }

  .bulk-move-target {
    min-width: 0;
    max-width: 300px;
    height: 32px;
    padding: 0 28px 0 9px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    color: var(--text-primary, #2d3748);
    background-color: var(--card-bg, #ffffff);
  }

  .bulk-move-submit {
    min-height: 32px;
    padding: 5px 12px;
    border: 0;
    border-radius: 6px;
    color: white;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    background-color: #b8452b;
  }

  .bulk-move-submit:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (max-width: 700px) {
    .bulk-move-bar {
      align-items: stretch;
      flex-direction: column;
    }

    .bulk-move-controls {
      justify-content: stretch;
    }

    .bulk-move-target {
      max-width: none;
      flex: 1;
    }
  }

  .collapsed-sites {
    margin-top: 6px;
    margin-left: 0;
    padding-left: 0;
    padding-right: 25px;
  }

  .collapsed-sites > div {
    display: flex;
    align-items: center;
    min-height: 28px;
  }

  .collapsed-site {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border: 2px solid var(--card-bg, #ffffff);
    border-radius: 50%;
    background: var(--code-bg, #edf2f7);
    transition: 0.2s;
    position: relative;
  }

  .collapsed-site + .collapsed-site {
    margin-left: -8px;
  }

  .collapsed-site:hover {
    background: var(--code-bg, #edf2f7);
  }

  .collapsed-site-overflow {
    color: var(--text-secondary, #718096);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .fav.collapsed-fav {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-right: 0;
  }

  .fav .collapsed-fav-img {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: contain;
    object-position: center;
    background-color: transparent;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    margin-right: 4px;
    border: 0;
    font: inherit;
    color: var(--text-secondary, #718096);
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 0.15s ease, color 0.15s ease;
    background: transparent;
  }

  .btn:hover {
    background-color: rgba(0, 0, 0, 0.06);
    color: var(--text-primary, #2d3748);
  }

  .btn-icon {
    width: 16px;
    height: 16px;
  }

  .btn svg,
  .btn .btn-icon {
    stroke: var(--text-secondary, #718096) !important;
    transition: stroke 0.15s ease;
  }

  .btn:hover svg,
  .btn:hover .btn-icon {
    stroke: var(--text-primary, #2d3748) !important;
  }

  /* AI Enhance button — gold */
  .ai-btn svg,
  .ai-btn .btn-icon {
    stroke: #eab308 !important;
  }

  .ai-btn:hover {
    background-color: rgba(234, 179, 8, 0.1);
  }

  .ai-btn:hover svg,
  .ai-btn:hover .btn-icon {
    stroke: #ca8a04 !important;
  }

  /* Split button — purple */
  .split-btn svg,
  .split-btn .btn-icon {
    stroke: #8b5cf6 !important;
  }

  .split-btn:hover {
    background-color: rgba(139, 92, 246, 0.1);
  }

  .split-btn:hover svg,
  .split-btn:hover .btn-icon {
    stroke: #7c3aed !important;
  }

  .btn.loading {
    pointer-events: none;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Golden reveal after an AI enhance */
  .session-title.ai-updated {
    animation: ai-glow 0.5s ease-out 3;
  }

  @keyframes ai-glow {
    0% { box-shadow: inset 0 -10px #fadc23, 0 0 5px rgba(250, 220, 35, 0.3); transform: scale(1); }
    50% { box-shadow: inset 0 -10px #ffd700, 0 0 22px rgba(255, 215, 0, 0.7); transform: scale(1.02); }
    100% { box-shadow: inset 0 -10px #fadc23, 0 0 5px rgba(250, 220, 35, 0.3); transform: scale(1); }
  }

  .session-title .cursor {
    display: inline-block;
    margin-left: 1px;
    color: #eab308;
    font-weight: normal;
    animation: blink 0.7s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .del-btn:hover svg,
  .del-btn:hover .btn-icon {
    stroke: #eb5205 !important;
  }

  .del-res-btn:hover svg,
  .del-res-btn:hover .btn-icon {
    stroke: #35abe5 !important;
  }

  .del-btn:hover {
    background-color: rgba(235, 82, 5, 0.1);
    color: #eb5205;
  }

  .del-res-btn {
    gap: 2px;
  }

  .del-res-btn:hover {
    background-color: rgba(53, 171, 229, 0.1);
    color: #35abe5;
  }

  .tag-prompt {
    font-size: 14px;
    color: #999999;
    margin-top: 2px;
    margin-right: 5px;
  }

  .fav {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 5px;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .fav-img {
    width: 14px;
    height: 14px;
    vertical-align: middle;
  }

  .del-item {
    padding: 4px;
    color: var(--text-secondary, #999);
    display: none;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }

  .del-item:hover {
    color: #eb5205;
  }

  .del-item svg {
    stroke: currentColor;
  }

  @media (max-width: 700px) {
    .session.session-editing {
      padding: 14px 12px 12px;
    }

    .session-title-edit {
      width: 100%;
    }

    .session-header-left {
      flex: 1;
    }

    .site-editor,
    .site-editor-columns {
      grid-template-columns: 18px minmax(0, 1.15fr) minmax(0, 0.85fr) 28px;
      gap: 6px;
    }

    .edit-save-btn span {
      display: none;
    }

    .edit-save-btn {
      width: 34px;
      padding: 6px;
    }
  }

  @media (prefers-color-scheme: dark) {
    .session {
      background-color: var(--card-bg, #2a2a2a);
      color: #d0d0d0;
      border-color: #3a3a3a;
    }

    .session.session-editing {
      border-color: rgba(250, 128, 114, 0.42);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
    }

    .session-title-edit,
    .tab-edit {
      border-color: #4a5568;
      color: #f5f5f5;
      background-color: #30343a;
    }

    .editing-site-row {
      border-color: #3f4650;
      background-color: rgba(255, 255, 255, 0.035);
    }

    .editing-site-row:hover {
      background-color: rgba(255, 255, 255, 0.055);
    }

    .add-edit-site {
      color: #ff9b8f;
      border-color: rgba(255, 155, 143, 0.45);
      background-color: rgba(250, 128, 114, 0.08);
    }

    .search-match-count[data-expander="true"]:hover {
      background-color: rgba(255, 255, 255, 0.08);
      color: var(--text-primary, #f7fafc);
    }

    .link {
      background-color: #00000000;
    }

    .session-title {
      color: #f5f5f5;
      box-shadow: inset 0 -10px #685e02;
    }

    .btn {
      color: var(--text-secondary, #a0aec0);
    }

    .btn svg,
    .btn .btn-icon {
      stroke: var(--text-secondary, #a0aec0) !important;
    }

    .btn:hover {
      background-color: rgba(255, 255, 255, 0.08);
      color: var(--text-primary, #f7fafc);
    }

    .btn:hover svg,
    .btn:hover .btn-icon {
      stroke: var(--text-primary, #f7fafc) !important;
    }

    .ai-btn svg,
    .ai-btn .btn-icon {
      stroke: #facc15 !important;
    }

    .ai-btn:hover {
      background-color: rgba(250, 204, 21, 0.15);
    }

    .ai-btn:hover svg,
    .ai-btn:hover .btn-icon {
      stroke: #fde047 !important;
    }

    .split-btn svg,
    .split-btn .btn-icon {
      stroke: #a78bfa !important;
    }

    .split-btn:hover {
      background-color: rgba(167, 139, 250, 0.15);
    }

    .split-btn:hover svg,
    .split-btn:hover .btn-icon {
      stroke: #c4b5fd !important;
    }

    .del-btn:hover {
      background-color: rgba(235, 82, 5, 0.15);
      color: #ff7043;
    }

    .del-btn:hover svg,
    .del-btn:hover .btn-icon {
      stroke: #ff7043 !important;
    }

    .del-res-btn:hover {
      background-color: rgba(53, 171, 229, 0.15);
      color: #64b5f6;
    }

    .del-res-btn:hover svg,
    .del-res-btn:hover .btn-icon {
      stroke: #64b5f6 !important;
    }

    .fav > img {
      background-color: #aaaaaa;
      border-radius: 2px;
    }

    .tag {
      background-color: #404040;
      border-color: #555555;
      color: #d0d0d0;
    }
  }

</style>
