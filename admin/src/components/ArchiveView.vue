<template>
  <div class="archive-view" data-testid="archive-view">
    <div class="archive-toolbar" data-testid="archive-status">
      <!-- What gets saved, and where, is told on demand instead of in a
           standing paragraph above the list. -->
      <div class="archive-help" ref="help">
        <button type="button" class="archive-help-chip" data-testid="archive-help"
                :aria-expanded="helpOpen ? 'true' : 'false'" @click="helpOpen = !helpOpen">
          <v-icon name="info" class="archive-help-icon"></v-icon>
          <span>{{ lang.archiveHowItWorks }}</span>
        </button>
        <div v-if="helpOpen" class="archive-help-popover" role="dialog" :aria-label="lang.archiveHowItWorks"
             data-testid="archive-help-popover">
          <p class="archive-help-title">{{ lang.archiveSwitch }}</p>
          <ul class="archive-help-points">
            <li>
              <span class="archive-help-point-icon"><v-icon name="archive"></v-icon></span>
              <span>{{ lang.archiveHelpWhat }}</span>
            </li>
            <li>
              <span class="archive-help-point-icon"><v-icon name="slash"></v-icon></span>
              <span>{{ lang.archiveHelpNot }}</span>
            </li>
            <li>
              <span class="archive-help-point-icon"><v-icon name="monitor"></v-icon></span>
              <span>{{ lang.archiveHelpLocal }}</span>
            </li>
          </ul>
          <p v-if="archive.lastCapturedAt" class="archive-help-note">{{ lastSavedText }}</p>
        </div>
      </div>
      <label class="archive-switch">
        <span>{{ lang.archiveSwitch }}</span>
        <toggle-button
            data-testid="archive-toggle"
            :value="archive.enabled"
            :sync="true"
            :width="36"
            :height="20"
            :color="{checked: '#fa8072', unchecked: '#ccc'}"
            @change="setEnabled"
        />
      </label>
    </div>
    <p v-if="!archive.enabled" class="archive-note" data-testid="archive-off">{{ lang.archiveDisabled }}</p>
    <p v-if="archive.retentionDays" class="archive-note" data-testid="archive-retention">
      {{ retentionText }}
    </p>

    <div v-if="archive.entries.length === 0" class="archive-empty" data-testid="archive-empty">
      {{ lang.archiveNothingYet }}
    </div>

    <section v-for="group in groups" :key="group.day" class="archive-day">
      <h3 class="archive-day-title">{{ group.label }}</h3>

      <!-- Titles only, like the session list in that view: one card a day, one
           row an entry, and a click on the row shows its pages. -->
      <div v-if="sessionViewMode === 'titles'" class="titles-card">
        <div v-for="entry in group.entries" :key="entry.id" class="titles-row"
             :data-testid="`archive-entry-${entry.id}`">
          <div class="titles-summary" @click="toggle(entry)">
            <span class="titles-title">{{ entryTitle(entry) }}</span>
            <span class="source-chip titles-tag" data-testid="archive-reason">
              <v-icon :name="reasonIcon(entry)"></v-icon>{{ reasonLabel(entry) }}
            </span>
            <span v-if="expiryLabel(entry)" class="tag tag-expiry titles-tag">{{ expiryLabel(entry) }}</span>
            <span class="titles-spacer" aria-hidden="true"></span>
            <span class="titles-count">{{ countLabel(entry) }}</span>
            <button type="button" class="btn del-btn" data-testid="archive-delete"
                    :aria-label="lang.archiveDelete" :title="lang.archiveDelete" @click.stop="remove(entry)">
              <v-icon name="trash-2" class="btn-icon"></v-icon>
            </button>
            <button type="button" class="btn keep-btn" data-testid="archive-keep"
                    :aria-label="lang.archiveKeep" :title="lang.archiveKeep"
                    :disabled="pendingId === entry.id" @click.stop="keep(entry)">
              <v-icon name="bookmark" class="btn-icon"></v-icon>
            </button>
            <button type="button" class="btn restore-btn" data-testid="archive-open"
                    :aria-label="lang.archiveOpenAll" :title="lang.archiveOpenAll" @click.stop="openAll(entry)">
              <v-icon name="external-link" class="btn-icon" :stroke-width="2.4"></v-icon>
            </button>
          </div>
          <ul v-if="expanded[entry.id]" class="archive-sites titles-sites">
            <li v-for="site in entry.sites" :key="site.url">
              <div class="fav">
                <img class="fav-img" :src="favicon(site.url) || fallbackIcon" loading="lazy" decoding="async"
                     referrerpolicy="no-referrer" alt @error="useFallbackIcon">
              </div>
              <span class="site-title">
                <a class="link" :href="site.url" target="_blank" rel="noopener">{{ site.title || site.url }}</a>
              </span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Otherwise laid out like a saved session's card, so the two read as
           one library. -->
      <template v-else>
        <article
            v-for="entry in group.entries"
            :key="entry.id"
            class="archive-entry"
            :data-testid="`archive-entry-${entry.id}`"
            @click="handleCardClick($event, entry)"
        >
          <div class="archive-entry-header">
            <span class="archive-entry-title">{{ entryTitle(entry) }}</span>
            <div class="archive-entry-actions">
              <button type="button" class="btn restore-btn" data-testid="archive-open"
                      :aria-label="lang.archiveOpenAll" :title="lang.archiveOpenAll" @click="openAll(entry)">
                <v-icon name="external-link" class="btn-icon" :stroke-width="2.4"></v-icon>
              </button>
              <button type="button" class="btn keep-btn" data-testid="archive-keep"
                      :aria-label="lang.archiveKeep" :title="lang.archiveKeep"
                      :disabled="pendingId === entry.id" @click="keep(entry)">
                <v-icon name="bookmark" class="btn-icon"></v-icon>
              </button>
              <button type="button" class="btn del-btn" data-testid="archive-delete"
                      :aria-label="lang.archiveDelete" :title="lang.archiveDelete" @click="remove(entry)">
                <v-icon name="trash-2" class="btn-icon"></v-icon>
              </button>
            </div>
          </div>
          <!-- The compact view shows the favicon strip, and a click on the
               card opens it, as on a session card. -->
          <ul :class="['archive-sites', {'collapsed-sites': isCompact(entry)}]" data-testid="archive-sites">
            <li v-for="site in visibleSites(entry)" :key="site.url"
                :class="{'collapsed-site': isCompact(entry)}" :title="isCompact(entry) ? (site.title || site.url) : null">
              <div :class="['fav', {'collapsed-fav': isCompact(entry)}]">
                <img :class="['fav-img', {'collapsed-fav-img': isCompact(entry)}]"
                     :src="favicon(site.url) || fallbackIcon" loading="lazy" decoding="async"
                     referrerpolicy="no-referrer" alt @error="useFallbackIcon">
              </div>
              <span v-if="!isCompact(entry)" class="site-title">
                <a class="link" :href="site.url" target="_blank" rel="noopener">{{ site.title || site.url }}</a>
              </span>
            </li>
            <li v-if="isCompact(entry) && entry.sites.length > collapsedVisibleLimit"
                class="collapsed-site collapsed-site-overflow">
              +{{ entry.sites.length - collapsedVisibleLimit }}
            </li>
          </ul>
          <div class="archive-tags">
            <!-- Tag-shaped, but tinted and inert: it says how the pages were saved,
                 not a tag anyone set. -->
            <span class="source-chip" data-testid="archive-reason">
              <v-icon :name="reasonIcon(entry)"></v-icon>{{ reasonLabel(entry) }}
            </span>
            <span v-if="expiryLabel(entry)" class="tag tag-expiry">{{ expiryLabel(entry) }}</span>
          </div>
        </article>
      </template>
    </section>

    <button v-if="archive.nextBeforeDay" type="button" class="archive-load-more" data-testid="archive-load-more"
            @click="loadMore">
      {{ lang.archiveLoadMore }}
    </button>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { ToggleButton } from 'vue-js-toggle-button'
import Constants from '../constants'
import { faviconUrl } from '../favicon'
import WebPageIcon from '../assets/img/icon-webpage.svg'

const dayMs = 86400000

export default {
  name: "ArchiveView",
  components: { ToggleButton },
  data() {
    return {
      collapsedVisibleLimit: 10,
      expanded: {},
      pendingId: "",
      helpOpen: false,
      fallbackIcon: WebPageIcon,
      now: Date.now()
    }
  },
  computed: {
    ...mapState(["lang", "bridge", "archive", "tabSpaceSettings", "sessionViewMode"]),
    locale() {
      return this.tabSpaceSettings[Constants.preferredLanguageKey] || undefined
    },
    groups() {
      const groups = []
      for (const entry of this.archive.entries) {
        const date = new Date(entry.updatedAt * 1000)
        const day = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        let group = groups[groups.length - 1]
        if (!group || group.day !== day) {
          group = { day, label: this.dayLabel(date), entries: [] }
          groups.push(group)
        }
        group.entries.push(entry)
      }
      return groups
    },
    lastSavedText() {
      return this.lang.archiveLastCaptured.replace("{time}", this.relativeTime(this.archive.lastCapturedAt))
    },
    retentionText() {
      return this.lang.archiveFreeRetention.replace("{days}", this.archive.retentionDays)
    }
  },
  mounted() {
    this.refresh()
    document.addEventListener("visibilitychange", this.onVisibilityChange)
    document.addEventListener("keydown", this.onKeydown)
    document.addEventListener("click", this.onDocumentClick)
  },
  beforeDestroy() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange)
    document.removeEventListener("keydown", this.onKeydown)
    document.removeEventListener("click", this.onDocumentClick)
  },
  methods: {
    refresh() {
      this.now = Date.now()
      if (this.bridge) this.bridge.send({ cmd: "ListArchive" })
    },
    onVisibilityChange() {
      if (document.visibilityState === "visible") this.refresh()
    },
    loadMore() {
      if (this.bridge && this.archive.nextBeforeDay) {
        this.bridge.send({ cmd: "ListArchive", beforeDay: this.archive.nextBeforeDay })
      }
    },
    onKeydown(event) {
      if (event.key === "Escape") this.helpOpen = false
    },
    onDocumentClick(event) {
      if (this.helpOpen && this.$refs.help && !this.$refs.help.contains(event.target)) this.helpOpen = false
    },
    // The same setting as the switch in General Preferences.
    setEnabled(event) {
      if (!this.bridge) return
      const value = event.value ? "true" : "false"
      this.bridge.send({ cmd: "SetDefault", name: "auto-archive-enabled", value })
      this.$store.commit("setTabSpaceSetting", { key: "auto-archive-enabled", value })
      this.$store.commit("setArchiveEnabled", event.value)
    },
    openAll(entry) {
      if (!this.bridge) return
      this.bridge.send({
        cmd: "RestoreSession",
        bookmarks: [{ title: this.entryTitle(entry), sites: entry.sites, tags: [], timestamp: entry.updatedAt }]
      })
    },
    keep(entry) {
      if (!this.bridge) return
      this.pendingId = entry.id
      // The app names the new session the way it names every save, so the
      // automatic AI naming applies to it as well.
      this.bridge.send({ cmd: "KeepArchiveEntry", id: entry.id, title: "" })
      setTimeout(() => { if (this.pendingId === entry.id) this.pendingId = "" }, 3000)
    },
    remove(entry) {
      if (this.bridge) this.bridge.send({ cmd: "DeleteArchiveEntries", ids: [entry.id] })
    },
    isCompact(entry) {
      return this.sessionViewMode === "compact" && !this.expanded[entry.id]
    },
    toggle(entry) {
      this.$set(this.expanded, entry.id, !this.expanded[entry.id])
    },
    countLabel(entry) {
      const count = entry.sites.length
      return `${count} ${count === 1 ? (this.lang.tab || "tab") : (this.lang.tabs || "tabs")}`
    },
    handleCardClick(event, entry) {
      if (this.sessionViewMode !== "compact") return
      if (event.target.closest("a, button, .tag")) return
      this.$set(this.expanded, entry.id, !this.expanded[entry.id])
    },
    visibleSites(entry) {
      return this.isCompact(entry) ? entry.sites.slice(0, this.collapsedVisibleLimit) : entry.sites
    },
    favicon(url) {
      return faviconUrl(url)
    },
    useFallbackIcon(event) {
      if (event && event.target && event.target.src !== this.fallbackIcon) event.target.src = this.fallbackIcon
    },
    // Named the way an untitled saved session is.
    entryTitle(entry) {
      return `${this.lang.saveAt} ${new Date(entry.updatedAt * 1000).Format('yyyy-MM-dd hh:mm')}`
    },
    reasonIcon(entry) {
      if (entry.reason === "burst") return "layers"
      if (entry.reason === "restart") return "rotate-ccw"
      return "layout"
    },
    reasonLabel(entry) {
      if (entry.reason === "burst") return this.lang.archiveReasonBurst
      if (entry.reason === "restart") return this.lang.archiveReasonRestart
      return this.lang.archiveReasonWindow
    },
    // Free entries say when they go, once that is close.
    expiryLabel(entry) {
      if (!this.archive.retentionDays) return ""
      const left = Math.ceil((entry.updatedAt * 1000 + this.archive.retentionDays * dayMs - this.now) / dayMs)
      if (left > 3) return ""
      return this.lang.archiveExpiresIn.replace("{days}", Math.max(1, left))
    },
    dayLabel(date) {
      const today = new Date(this.now)
      today.setHours(0, 0, 0, 0)
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const days = Math.round((today - start) / dayMs)
      if (days === 0) return this.lang.archiveToday
      if (days === 1) return this.lang.archiveYesterday
      return date.toLocaleDateString(this.locale, { weekday: "short", month: "short", day: "numeric" })
    },
    relativeTime(seconds) {
      const elapsed = Math.max(0, Math.round((this.now - seconds * 1000) / 60000))
      try {
        const format = new Intl.RelativeTimeFormat(this.locale, { numeric: "auto" })
        if (elapsed < 60) return format.format(-elapsed, "minute")
        if (elapsed < 1440) return format.format(-Math.round(elapsed / 60), "hour")
        return format.format(-Math.round(elapsed / 1440), "day")
      } catch (_) {
        return new Date(seconds * 1000).toLocaleString(this.locale)
      }
    }
  }
}
</script>

<style scoped>
.archive-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.archive-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.archive-help {
  position: relative;
}

.archive-help-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border: 0;
  border-radius: 999px;
  background-color: rgba(250, 128, 114, 0.08);
  color: var(--text-secondary, #666);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.archive-help-chip:hover,
.archive-help-chip[aria-expanded="true"] {
  background-color: rgba(250, 128, 114, 0.16);
  color: var(--text-primary, #2d3748);
}

.archive-help-icon {
  width: 14px;
  height: 14px;
  stroke: var(--primary-color, #fa8072);
}

/* The switcher hint's popover: a floating card with a caret toward the chip. */
.archive-help-popover {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 1100;
  width: 340px;
  max-width: calc(100vw - 32px);
  padding: 14px 16px 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg, #fff);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08);
  animation: archive-help-in 0.14s ease-out;
}

.archive-help-popover::before {
  content: "";
  position: absolute;
  top: -6px;
  left: 22px;
  width: 10px;
  height: 10px;
  background: var(--card-bg, #fff);
  border-left: 1px solid var(--border-color);
  border-top: 1px solid var(--border-color);
  transform: rotate(45deg);
}

@keyframes archive-help-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

.archive-help-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.archive-help-points {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Undo the library's global row style for list items. */
.archive-help-points li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.archive-help-points li:hover {
  background: none;
}

.archive-help-point-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  height: 24px;
  border-radius: 7px;
  background-color: rgba(250, 128, 114, 0.12);
}

.archive-help-point-icon svg {
  width: 13px;
  height: 13px;
  stroke: var(--primary-color, #fa8072);
}

.archive-help-note {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border-color, #e2e8f0);
  font-size: 11.5px;
  color: var(--text-secondary);
}

.archive-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, #666);
  cursor: pointer;
}

.archive-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary, #888);
}

.archive-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-secondary, #888);
  font-size: 14px;
}

.archive-day-title {
  margin: 8px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #666);
}

/* The card, header, buttons and page rows follow SessionCard. */
.archive-entry {
  border-radius: var(--radius-lg, 12px);
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

.archive-entry:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06));
  z-index: 50;
}

.archive-entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.archive-entry-title {
  font-size: 18px;
  font-weight: bold;
  box-shadow: inset 0 -10px #fadc23;
  display: inline-block;
  min-height: 22px;
  max-width: 350px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 20px;
}

.archive-tags {
  display: flex;
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

.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 1px 5px 5px 0;
  padding: 5px 10px 5px 8px;
  border: 1px solid rgba(250, 128, 114, 0.22);
  border-radius: 999px;
  background-color: rgba(250, 128, 114, 0.08);
  color: #c4594b;
  font-size: 11px;
  line-height: 1;
  cursor: default;
}

.source-chip svg {
  width: 11px;
  height: 11px;
  stroke: currentColor;
}

.tag-expiry {
  color: #c2410c;
  background-color: #fff4e5;
  border-color: #fcd9b0;
}

.archive-entry-actions {
  display: flex;
  align-items: center;
  white-space: nowrap;
  flex-shrink: 0;
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
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.btn svg {
  stroke: var(--text-secondary, #718096) !important;
  transition: stroke 0.15s ease;
}

.btn:hover svg {
  stroke: var(--text-primary, #2d3748) !important;
}

.restore-btn svg {
  stroke: var(--primary-color, #fa8072) !important;
}

.restore-btn:hover {
  background-color: rgba(250, 128, 114, 0.12);
}

.restore-btn:hover svg {
  stroke: var(--primary-color-hover, #e07060) !important;
}

.keep-btn:hover {
  background-color: rgba(53, 171, 229, 0.12);
}

.keep-btn:hover svg {
  stroke: #35abe5 !important;
}

.del-btn:hover {
  background-color: rgba(235, 82, 5, 0.1);
}

.del-btn:hover svg {
  stroke: #eb5205 !important;
}

.archive-sites {
  margin: 0 0 0 -45px;
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

.site-title {
  flex: 1;
  min-width: 0;
}

.site-title .link {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 50px);
}

/* Titles only: the session list's view of the same name. */
.titles-card {
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto 16px;
  padding: 6px 18px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--card-bg, white);
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
}

.titles-row {
  min-width: 0;
  padding: 8px 4px;
}

.titles-row + .titles-row {
  border-top: 1px solid var(--border-color, #e2e8f0);
}

.titles-summary {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 30px;
  margin: -4px;
  padding: 4px;
  border-radius: 6px;
  cursor: default;
  transition: background-color 0.15s ease-out;
}

.titles-summary:hover {
  background-color: rgba(0, 0, 0, 0.035);
}

.titles-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 15px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 10px;
}

.titles-tag {
  margin: 0 5px 0 0;
  flex-shrink: 0;
}

.titles-spacer {
  flex: 1;
  min-width: 12px;
}

.titles-count {
  flex-shrink: 0;
  margin: 0 10px;
  color: var(--text-secondary, #718096);
  font-size: 12px;
  white-space: nowrap;
}

.titles-summary .btn {
  margin-right: 0;
}

.titles-sites {
  margin: 8px 0 0 -45px;
}

.collapsed-sites {
  display: flex;
  align-items: center;
  min-height: 28px;
  margin: 6px 0 0;
  padding: 0 25px 0 0;
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
  background-color: transparent;
}

.archive-load-more {
  align-self: center;
  border: 1px solid var(--border-color, #ddd);
  background: transparent;
  border-radius: 8px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  color: inherit;
}

@media (prefers-color-scheme: dark) {
  .titles-card {
    color: #d0d0d0;
    border-color: #3a3a3a;
    background-color: var(--card-bg, #2a2a2a);
  }

  .titles-summary:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  .archive-help-popover {
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .archive-entry {
    background-color: var(--card-bg, #2a2a2a);
    color: #d0d0d0;
    border-color: #3a3a3a;
  }

  .tag {
    background-color: #404040;
    border-color: #555555;
    color: #d0d0d0;
  }

  .tag-expiry {
    color: #fdba74;
  }

  .source-chip {
    color: #f4a497;
    background-color: rgba(250, 128, 114, 0.12);
    border-color: rgba(250, 128, 114, 0.28);
  }

  .archive-entry-title {
    color: #f5f5f5;
    box-shadow: inset 0 -10px #685e02;
  }

  .btn:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }

  .btn:hover svg {
    stroke: #e2e8f0 !important;
  }

  .fav > img {
    background-color: #aaaaaa;
    border-radius: 2px;
  }
}
</style>
