<template>
  <nav>
    <div>
      <a class="link" data-testid="changelog-link" href="https://mytab.space/changelog.html"
        target="_blank" rel="noopener" style="text-decoration: none; font-style: italic" v-html="lang.whatsNew"></a>
    </div>
    <!-- Export, import and backup were three top-level menus each. They are
         occasional housekeeping, and they were crowding out the things people
         come here to reach, so they share one entry and open as sections of it
         rather than as nested flyouts — a submenu that has to be hovered
         through is worse on a trackpad than a slightly taller menu. -->
    <div class="more" data-testid="more-menu">
      <button type="button" class="link menu-trigger">
        {{lang.more || 'More'}}
        <small>▼</small>
      </button>
      <div class="more-dropdown">
        <div v-if="activeTag !== '@Trash' && hasExportableSessions"
             class="more-group" data-testid="export-menu">
          <p class="more-group-title">{{lang.export}}</p>
          <export-dropdown></export-dropdown>
        </div>
        <div class="more-group" data-testid="import-menu">
          <p class="more-group-title">{{lang.import}}</p>
          <import-dropdown></import-dropdown>
        </div>
        <div class="more-group" data-testid="backup-menu">
          <p class="more-group-title">{{lang.backup || 'Backup'}}</p>
          <backup-dropdown></backup-dropdown>
        </div>
      </div>
    </div>
    <div>
      <a class="link icon-link" data-testid="multi-browser-link"
         href="https://mytab.space/multi-browser.html"
         target="_blank" rel="noopener noreferrer">
        <v-icon name="globe" aria-hidden="true"></v-icon>
        <span>{{lang.multiBrowser || 'Multi-browser'}}</span>
      </a>
    </div>
    <!-- Remaining-quota readout for Free and Plus. Pro gets the badge on the
         title instead. -->
    <div v-if="aiEnabled && showPlanStatus">
      <router-link class="link plan-status" data-testid="plan-status-link"
                   to="/settings" :title="planStatusTitle" :aria-label="planStatusTitle">
        <v-icon name="zap" class="plan-status-icon"></v-icon>
        <span>{{ planStatusLabel }}</span>
      </router-link>
    </div>
    <div>
      <!-- The href stays real so the entry is still a link (middle-click, copy
           address, screen readers). But on a Mac, following it lands on a
           listing that reports the iPhone app as incompatible and cannot sell
           it, so the click is intercepted and the install QR banner is opened
           instead. On a phone the link is the better answer and runs as usual. -->
      <a class="link ios-app-link"
         data-testid="ios-app-link"
         :href="appStoreUrl"
         target="_blank"
         rel="noopener noreferrer"
         @click="openIosApp">
        <v-icon name="smartphone" aria-hidden="true"></v-icon>
        <span>{{lang.iosAppNav}}</span>
      </a>
    </div>
    <div>
      <router-link class="link" data-testid="settings-link" to="/settings">{{lang.settings}}</router-link>
    </div>
  </nav>
</template>

<script>
import { mapState, mapGetters } from "vuex"
import { mobileAppStoreUrl } from "../app-store"
import { isHandheld } from "../device"
import Constants from "../constants"
import ExportDropdown from "./ExportDropdown"
import ImportDropdown from "./ImportDropdown"
import BackupDropdown from "./BackupDropdown"

export default {
  name: "Navbar",
  computed: {
    ...mapState(["lang", "bridge", "activeTag", "sessions", "tabSpaceSettings", "aiQuotaRemaining"]),
    ...mapGetters(["aiEnabled", "isPremium"]),
    appStoreUrl() {
      const preferredLanguage = this.tabSpaceSettings[Constants.preferredLanguageKey] || navigator.language
      return mobileAppStoreUrl(preferredLanguage)
    },
    quotaKnown() {
      return this.aiQuotaRemaining !== null && this.aiQuotaRemaining !== undefined
    },
    showPlanStatus() {
      // -1 means unlimited, which the AI service only ever grants to Pro.
      // A non-Pro tier paired with -1 is stale native data, not a real quota;
      // showing "Pro" (or an unlimited readout) for it would contradict the
      // plan shown in Settings, so treat the quota as unknown instead.
      return !this.isPremium && this.quotaKnown && this.aiQuotaRemaining !== -1
    },
    planStatusLabel() {
      if (this.aiQuotaRemaining === -1) return this.lang.aiQuotaUnlimited || "Unlimited AI requests"
      const template = this.lang.aiQuotaShort || "{count} AI left"
      return template.replace("{count}", Math.max(0, this.aiQuotaRemaining))
    },
    planStatusTitle() {
      if (this.aiQuotaRemaining === -1) {
        return this.lang.aiQuotaUnlimited || "Unlimited AI requests"
      }
      const template = this.lang.aiQuotaRemaining || "{count} AI requests left this week"
      return template.replace("{count}", Math.max(0, this.aiQuotaRemaining))
    },
    hasExportableSessions() {
      return this.sessions.some(session => (
        !(session.tags || []).some(tag => tag && tag.name === "@Trash")
      ))
    }
  },
  methods: {
    openIosApp(event) {
      // Phones and iPads can install straight from the link, and a QR code
      // aimed at the device already holding it would be absurd.
      if (this.isHandheld()) return
      event.preventDefault()
      this.$store.commit("requestIosBanner")
    },
    isHandheld
  },
  components: {
    ExportDropdown,
    ImportDropdown,
    BackupDropdown
  }
};
</script>

<style scoped>
  nav {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 8px;
    padding: 0 8px;
  }

  nav > div {
    display: flex;
    align-items: center;
  }

  .menu-trigger {
    background: transparent;
    border: 0;
    font: inherit;
    color: inherit;
  }

  nav > div {
    margin-right: 5px;
  }

  .link {
    padding: 4px 8px;
    border-radius: 4px;
    transition: background-color 0.15s ease;
    cursor: pointer;
  }

  .link:hover {
    background-color: rgba(0, 0, 0, 0.06);
  }

  .ios-app-link,
  .icon-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .icon-link ::v-deep .icon {
    width: 15px;
    height: 15px;
  }

  .ios-app-link .icon {
    width: 15px;
  }

  .plan-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
    opacity: 0.7;
    text-decoration: none;
    color: inherit;
  }

  .plan-status:hover {
    opacity: 1;
  }

  .plan-status-icon {
    width: 12px;
    height: 12px;
  }

  .more {
    display: inline-block;
    position: relative;
  }

  .more-dropdown {
    display: none;
    position: absolute;
    right: 0;
    padding: 4px;
    text-align: left;
    border: 1px solid var(--border-color, gray);
    border-radius: 6px;
    background-color: var(--card-bg, #fbfbfb);
    min-width: 170px;
    z-index: 100;
  }

  .more:hover .more-dropdown,
  .more:focus-within .more-dropdown {
    display: block;
  }

  .more-group + .more-group {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  .more-group-title {
    margin: 0;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-secondary, #718096);
  }

  /* Each of these was its own flyout and still carries the positioning for it.
     Inside More they are plain sections, so that positioning is turned off
     rather than duplicated into three near-identical components. */
  .more-dropdown ::v-deep .export-dropdown,
  .more-dropdown ::v-deep .import-dropdown,
  .more-dropdown ::v-deep .backup-dropdown {
    display: block;
    position: static;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    min-width: 0;
  }

  #file-input {
    position: fixed;
    right: -500px;
  }

  @media (prefers-color-scheme: dark) {
    .link:hover {
      background-color: rgba(255, 255, 255, 0.08);
    }
  }
</style>
