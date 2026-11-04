<template>
  <div class="archive-view" data-testid="archive-view">
    <div class="archive-status" data-testid="archive-status">
      <template v-if="archive.enabled">
        <span class="archive-status-dot" aria-hidden="true"></span>
        <span>{{ statusText }}</span>
      </template>
      <template v-else>
        <span>{{ lang.archiveDisabled }}</span>
        <button type="button" class="archive-link-button" data-testid="archive-turn-on" @click="turnOn">
          {{ lang.archiveTurnOn }}
        </button>
      </template>
    </div>
    <p class="archive-intro">{{ lang.archiveIntro }}</p>
    <p v-if="archive.retentionDays" class="archive-retention" data-testid="archive-retention">
      {{ retentionText }}
    </p>

    <div v-if="archive.entries.length === 0" class="archive-empty" data-testid="archive-empty">
      {{ lang.archiveNothingYet }}
    </div>

    <section v-for="group in groups" :key="group.day" class="archive-day">
      <h3 class="archive-day-title">{{ group.label }}</h3>
      <article
          v-for="entry in group.entries"
          :key="entry.id"
          class="archive-entry"
          :data-testid="`archive-entry-${entry.id}`"
      >
        <header class="archive-entry-header">
          <div class="archive-entry-heading">
            <span class="archive-entry-title">{{ entryTitle(entry) }}</span>
            <span class="archive-entry-meta">
              {{ reasonLabel(entry) }} · {{ timeLabel(entry.updatedAt) }} · {{ pagesLabel(entry) }}
              <template v-if="expiryLabel(entry)"> · <span class="archive-expiry">{{ expiryLabel(entry) }}</span></template>
            </span>
          </div>
          <div class="archive-entry-actions">
            <button type="button" class="archive-action" data-testid="archive-open" @click="openAll(entry)">
              {{ lang.archiveOpenAll }}
            </button>
            <button type="button" class="archive-action archive-action-primary" data-testid="archive-keep"
                    :disabled="pendingId === entry.id" @click="keep(entry)">
              {{ lang.archiveKeep }}
            </button>
            <button type="button" class="archive-action archive-action-icon" data-testid="archive-delete"
                    :aria-label="lang.archiveDelete" :title="lang.archiveDelete" @click="remove(entry)">
              <v-icon name="trash-2" :stroke-width="1.6"></v-icon>
            </button>
          </div>
        </header>
        <ul class="archive-sites">
          <li v-for="site in visibleSites(entry)" :key="site.url" class="archive-site">
            <img class="archive-favicon" :src="favicon(site.url) || fallbackIcon" loading="lazy" decoding="async"
                 referrerpolicy="no-referrer" alt @error="useFallbackIcon">
            <a class="archive-site-link" :href="site.url" target="_blank" rel="noopener">{{ site.title || site.url }}</a>
          </li>
        </ul>
        <button v-if="entry.sites.length > collapsedSiteCount && !expanded[entry.id]"
                type="button" class="archive-link-button archive-more" @click="expand(entry.id)">
          {{ moreLabel(entry) }}
        </button>
      </article>
    </section>

    <button v-if="archive.nextBeforeDay" type="button" class="archive-load-more" data-testid="archive-load-more"
            @click="loadMore">
      {{ lang.archiveLoadMore }}
    </button>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import Constants from '../constants'
import { faviconUrl } from '../favicon'
import WebPageIcon from '../assets/img/icon-webpage.svg'

const dayMs = 86400000

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch (_) {
    return ""
  }
}

export default {
  name: "ArchiveView",
  data() {
    return {
      collapsedSiteCount: 6,
      expanded: {},
      pendingId: "",
      fallbackIcon: WebPageIcon,
      now: Date.now()
    }
  },
  computed: {
    ...mapState(["lang", "bridge", "archive", "tabSpaceSettings"]),
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
    statusText() {
      if (!this.archive.lastCapturedAt) return this.lang.archiveOn
      return this.lang.archiveLastCaptured.replace("{time}", this.relativeTime(this.archive.lastCapturedAt))
    },
    retentionText() {
      return this.lang.archiveFreeRetention.replace("{days}", this.archive.retentionDays)
    }
  },
  mounted() {
    this.refresh()
    document.addEventListener("visibilitychange", this.onVisibilityChange)
  },
  beforeDestroy() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange)
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
    turnOn() {
      if (!this.bridge) return
      this.bridge.send({ cmd: "SetDefault", name: "auto-archive-enabled", value: "true" })
      this.$store.commit("setTabSpaceSetting", { key: "auto-archive-enabled", value: "true" })
      this.refresh()
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
    expand(id) {
      this.$set(this.expanded, id, true)
    },
    visibleSites(entry) {
      return this.expanded[entry.id] ? entry.sites : entry.sites.slice(0, this.collapsedSiteCount)
    },
    moreLabel(entry) {
      return this.lang.archiveMoreSites.replace("{count}", entry.sites.length - this.collapsedSiteCount)
    },
    favicon(url) {
      return faviconUrl(url)
    },
    useFallbackIcon(event) {
      if (event && event.target && event.target.src !== this.fallbackIcon) event.target.src = this.fallbackIcon
    },
    entryTitle(entry) {
      const hosts = []
      for (const site of entry.sites) {
        const host = hostOf(site.url)
        if (host && !hosts.includes(host)) hosts.push(host)
        if (hosts.length === 3) break
      }
      return hosts.length > 0 ? hosts.join(" · ") : (entry.sites[0] && entry.sites[0].title) || ""
    },
    reasonLabel(entry) {
      if (entry.reason === "burst") return this.lang.archiveReasonBurst
      if (entry.reason === "restart") return this.lang.archiveReasonRestart
      return this.lang.archiveReasonWindow
    },
    pagesLabel(entry) {
      return this.lang.archivePages.replace("{count}", entry.sites.length)
    },
    // Free entries say when they go, once that is close.
    expiryLabel(entry) {
      if (!this.archive.retentionDays) return ""
      const left = Math.ceil((entry.updatedAt * 1000 + this.archive.retentionDays * dayMs - this.now) / dayMs)
      if (left > 3) return ""
      return this.lang.archiveExpiresIn.replace("{days}", Math.max(1, left))
    },
    timeLabel(seconds) {
      return new Date(seconds * 1000).toLocaleTimeString(this.locale, { hour: "2-digit", minute: "2-digit" })
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

.archive-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.archive-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #34c759;
  flex-shrink: 0;
}

.archive-intro,
.archive-retention {
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

.archive-day {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.archive-day-title {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #666);
}

.archive-entry {
  background: var(--card-background, #fff);
  border: 1px solid var(--border-color, #e6e6e6);
  border-radius: 12px;
  padding: 12px 14px;
}

.archive-entry-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.archive-entry-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.archive-entry-title {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-entry-meta {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.archive-expiry {
  color: #d9822b;
}

.archive-entry-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.archive-action {
  border: 1px solid var(--border-color, #ddd);
  background: transparent;
  border-radius: 8px;
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  color: inherit;
}

.archive-action-primary {
  border-color: salmon;
  color: #e0604f;
}

.archive-action-icon {
  display: inline-flex;
  align-items: center;
  padding: 4px 6px;
}

.archive-action-icon svg {
  width: 14px;
  height: 14px;
}

.archive-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.archive-sites {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.archive-site {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.archive-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.archive-site-link {
  font-size: 13px;
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-site-link:hover {
  text-decoration: underline;
}

.archive-link-button {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  color: #e0604f;
  cursor: pointer;
}

.archive-more {
  margin-top: 6px;
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
  .archive-entry {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
  }
}
</style>
