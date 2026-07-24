<template>
  <div :class="embedded ? 'embedded-session' : 'session'"
      :id="embedded ? null : session.uuid"
      :data-testid="embedded ? 'embedded-session-content' : `session-${session.uuid}`">
    <div v-if="!embedded" class="session-header">
      <div class="session-header-left">
        <div class="tag-btn handle" v-if="showTagBtns && activeTag === '' && !hasSearch && !bulkSelectionMode" :title="lang.movePrompt">
          <v-icon name="align-justify" :stroke-width="1.8" style="margin-left:1px"></v-icon>
        </div>
        <div
            class="session-title"
            :id="'id'+session.uuid"
            @click.stop="editSessionName(session.uuid)"
            @blur="updateSessionName"
        >
          <span
              v-for="(part, index) in highlightParts(session.title || (`${lang.saveAt} ${(new Date(Number(session.timestamp))).Format('yyyy-MM-dd hh:mm')}`))"
              :key="index"
              :class="{'highlight': part.match}"
          >{{ part.text }}</span>
        </div>
        <span v-if="hasSearch" class="search-match-count" data-testid="search-match-count">
          {{ searchResultEntries.length }} / {{ session.sites.length }}
          {{ session.sites.length === 1 ? (lang.tab || 'tab') : (lang.tabs || 'tabs') }}
        </span>
      </div>
      <div class="session-header-right">
        <button v-if="bulkSelectionMode"
                type="button" class="btn" data-testid="cancel-bulk-select"
                @click.stop="cancelBulkSelection"
                :title="lang.cancel" :aria-label="lang.cancel">
          <v-icon name="x" class="btn-icon"></v-icon>
        </button>
        <button v-if="canToggleTemporaryExpansion && !isEditingSession(session) && !bulkSelectionMode"
                type="button" class="btn" data-testid="toggle-session-expansion"
                @click.stop="toggleTemporaryExpansion"
                :title="temporaryExpansionLabel" :aria-label="temporaryExpansionLabel">
          <v-icon :name="temporarilyExpanded ? 'minimize' : 'maximize'" class="btn-icon"></v-icon>
        </button>
        <button v-if="!bulkSelectionMode" type="button" class="btn" data-testid="restore-session" @click.stop="restore(session.uuid, true, false)"
                :title="lang.openSession || 'Open'" :aria-label="lang.openSession || 'Open'">
          <v-icon name="external-link" class="btn-icon"></v-icon>
        </button>
        <button v-if="!bulkSelectionMode" type="button" class="btn del-btn" data-testid="delete-session" @click.stop="restore(session.uuid, false, true)"
                :title="lang.deleteSession || 'Delete'" :aria-label="lang.deleteSession || 'Delete'">
          <v-icon name="trash-2" class="btn-icon"></v-icon>
        </button>
        <div v-if="activeTag !== '@Trash' && !bulkSelectionMode" class="export" data-testid="export-session-menu">
          <button type="button" class="btn" :title="lang.exportSession || 'Export'" :aria-label="lang.exportSession || 'Export'">
            <v-icon name="share-2" class="btn-icon"></v-icon>
          </button>
          <export-dropdown :selectedSessions="[session]"></export-dropdown>
        </div>
      </div>
    </div>
    <ul :class="['session-sites', {'collapsed-sites': compactView}]">
      <draggable :disabled="embedded || isEditingSession(session) || compactView || hasSearch || bulkSelectionMode" :forceFallback="true" fallbackTolerance="10"
      :list="session.sites" group="shared" @start="() => startDragSite(session)" @end="endDragSite">
        <li
          v-for="(entry, visibleIndex) in visibleSiteEntries"
          v-bind:key="`${session.uuid}-${entry.originalIndex}`"
          :class="{
            'collapsed-site': compactView,
            'bulk-selectable-site': bulkSelectionMode,
            'bulk-selected-site': isSiteSelected(entry.originalIndex)
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
          <div v-if="editingSessionUuid === session.uuid">
            <v-icon name="compass" :stroke-width="1.5" style="margin-bottom: -3px"></v-icon>
            <input class="tab-edit" placeholder="url" type="text" v-model="entry.site.url"><br>
            <v-icon name="corner-down-right" :stroke-width="1" style="margin-left: 30px"></v-icon>
            <input class="tab-edit" placeholder="title" type="text" v-model="entry.site.title">
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
        <li v-if="isEditingSession(session)">
          <div class="tag-btn" @click="() => { session.sites.push({title: '', url: ''}) }">
            <v-icon name="file-plus" :stroke-width="2" stroke="green"></v-icon>
          </div>
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
          :class="{'search-tag': hasSearch}"
          v-for="tag in visibleTags(session)"
          @click="hasSearch ? null : removeTag(tag.name, session)"
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
              v-if="!hasSearch && tagEditorId !== session.uuid" @click="e => addTag(e, session.uuid)">
        <v-icon name="tag" style="margin-bottom: -4px" :stroke-width="1.5"></v-icon>
      </button>
      <vue-autosuggest
        class="autosuggest"
        v-if="tagEditorId === session.uuid"
        v-model="tagKeyword"
        :suggestions="[{data: tagOptions(session.tags)}]"
        :should-render-suggestions="shouldRenderTagSuggestions" 
        :input-props="{id: 'autosuggest__input', placeholder: lang.tagPrompt, autofocus: 'autofocus'}"
        @blur="saveTag"
        @selected="chooseTag"
      >  
        <template slot-scope="{suggestion}">
          <span class="suggest-tag">{{suggestion.item}}</span>
        </template>
      </vue-autosuggest>
      <button type="button" class="tag-btn" data-testid="toggle-favorite" v-if="!hasSearch && (showTagBtns || isFavorite(session))"
              :aria-label="lang.favorite || 'Favorite'" @click="() => toggleFavorite(session)">
        <v-icon name="star" :stroke-width="1.5"
        :fill="isFavorite(session) ? 'salmon' : 'none'"
        :stroke="isFavorite(session) ? 'salmon' : 'currentColor'"
        ></v-icon>
      </button>
      <div v-if="showTagBtns && !hasSearch" style="display: flex; transition: 3s">
        <button type="button" class="tag-btn" data-testid="bulk-select-tabs"
          v-if="canBulkMove" :title="lang.selectTabs" :aria-label="lang.selectTabs"
          @click.stop="beginBulkSelection(false)">
          <v-icon name="check-square" :stroke-width="1.5"></v-icon>
        </button>
        <button type="button" data-testid="edit-session" :title="lang.editPrompt" :aria-label="lang.editPrompt"
        v-if="!embedded && editingSessionUuid !== session.uuid" class="tag-btn"
        @click="() => { editingSessionUuid = session.uuid; session.sites.push({title: '', url: ''})}">
          <v-icon name="edit" :stroke-width="1.5"></v-icon>
        </button>
        <button type="button" v-else-if="!embedded" class="tag-btn" data-testid="save-session" :aria-label="lang.editPrompt"
        @click="() => { editingSessionUuid = ''; updateSession(session) }">
          <v-icon name="check" :stroke-width="4" stroke="green"></v-icon>
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
  import { VueAutosuggest } from 'vue-autosuggest';

  import WangYeIcon from '../assets/img/icon-webpage.svg';
  import Draggable from 'vuedraggable';
  import ExportDropdown from './ExportDropdown';
  import { highlightedTextParts, matchingSiteEntries } from '../search';

  export default {
    name: "SessionCard",
    components: {
      Draggable,
      ExportDropdown,
      VueAutosuggest
    },
    props: ["session", "showTagBtns", "embedded"],
    data() {
      return {
        collapsedVisibleLimit: 10,
        tagEditorId: false,
        WangYeIcon: WangYeIcon,
        tagKeyword: "",
        temporarilyExpanded: false,
        bulkSelectionMode: false,
        bulkSelectionPreviousExpansion: false,
        selectedSiteIndexes: [],
        bulkMoveTargetUuid: ""
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "keyword", "sessionViewMode", "sessions", "activeTag", "editingSessionUuid", "tabSpaceSettings"]),
      ...mapGetters(["tags"]),
      hasSearch() {
        return Boolean(this.keyword && this.keyword.trim())
      },
      compactView() {
        return this.sessionViewMode === "compact"
          && !this.hasSearch
          && !this.temporarilyExpanded
          && !this.isEditingSession(this.session)
      },
      canToggleTemporaryExpansion() {
        return this.sessionViewMode === "compact" || this.hasSearch
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
      tagOptions() {
        return function(exsitingTags) {
          exsitingTags = exsitingTags.map(t => t.name)
          if (Array.isArray(this.tags)) {
            let pattern = ".*" + this.tagKeyword.toLowerCase().split("").join(".*") + ".*"
            return this.tags.filter(tag => {
              let res = tag.toLowerCase().match(new RegExp(pattern, "gi"))
              return exsitingTags.indexOf(tag) === -1 && (res && res[0]) === tag.toLowerCase()
            })
          }
          return []
        }
      }
    },
    watch: {
      showTagBtns() {
        this.tagEditorId = false
      },
      keyword() {
        if (this.bulkSelectionMode) this.cancelBulkSelection()
        this.temporarilyExpanded = false
      },
      sessionViewMode() {
        if (this.bulkSelectionMode) this.cancelBulkSelection()
        this.temporarilyExpanded = false
      }
    },
    methods: {
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
      toggleTemporaryExpansion() {
        this.temporarilyExpanded = !this.temporarilyExpanded
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
          if (session.uuid.slice(0,3) === "new") {
            this.$store.commit("spliceSessions", {start: this.sessions.findIndex(s => s.uuid = session.uuid), deleteCount: 1, items: []})
          }
        })
        sessions = sessions.filter(s => s.uuid.slice(0,3) !== "new")
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
          let isNewSession = session.uuid.slice(0,3) === "new"
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
        this.tagEditorId = id
      },
      setTag(tagName, session) {
        if (!tagName) return
        if (!session.tags.map(t => t.name).includes(tagName)) {
          session.tags.push({name: tagName})
        }
        this.tagKeyword = ""
        this.updateSession(session)
      },
      saveTag() {
        setTimeout(() => {
          let session = this.getSessionById(this.tagEditorId) 
          this.setTag(this.tagKeyword, session)
          this.tagEditorId = false
        }, 100)
      },
      chooseTag(tag) {
        let session = this.getSessionById(this.tagEditorId) 
        this.setTag(tag.item, session)
        this.tagEditorId = false
      },
      removeTag(tag, session) {
        session.tags = session.tags.filter(t => t.name !== tag)
        this.updateSession(session)
      },
      shouldRenderTagSuggestions(size, loading) {
        return size > 0 && (this.tagKeyword === "" || !loading)
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
        if (this.newSession.sites.length === 0) this.$store.commit("spliceSessions", {start: this.crtId + 1, deleteCount: 1, items: []})
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

  .search-match-count {
    color: var(--text-secondary, #718096);
    flex-shrink: 0;
    font-size: 11px;
    margin-right: 10px;
    white-space: nowrap;
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

  .tab-edit {
    background-color: #dedede;
    outline: none;
    border-radius: 3px;
    border-width: 0;
    padding-left: 5px;
    width: 400px;
    font-size: 14px;
    height: 18px;
    line-height: 18px;
    margin: 4px;
  }

  @media (prefers-color-scheme: dark) {
    .tab-edit {
      background-color: #555;
    }

    .session {
      background-color: var(--card-bg, #2a2a2a);
      color: #d0d0d0;
      border-color: #3a3a3a;
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
