<template>
  <nav>
    <div>
      <a class="link" data-testid="changelog-link" href="https://mytab.space/changelog.html"
        target="_blank" rel="noopener" style="text-decoration: none; font-style: italic" v-html="lang.whatsNew"></a>
    </div>
    <div v-if="activeTag !== '@Trash' && hasExportableSessions" class="export" data-testid="export-menu">
      <button type="button" class="link menu-trigger">
        {{lang.export}}
        <small>▼</small>
      </button>
      <export-dropdown></export-dropdown>
    </div>
    <div class="import" data-testid="import-menu">
      <button type="button" class="link menu-trigger">
        {{lang.import}}
        <small>▼</small>
      </button>
      <import-dropdown></import-dropdown>
    </div>
    <div class="backup" data-testid="backup-menu">
      <button type="button" class="link menu-trigger">
        {{lang.backup || 'Backup'}}
        <small>▼</small>
      </button>
      <backup-dropdown></backup-dropdown>
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
      <a class="link ios-app-link"
         data-testid="ios-app-link"
         :href="appStoreUrl"
         target="_blank"
         rel="noopener noreferrer">
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
      return !this.isPremium && this.quotaKnown
    },
    planStatusLabel() {
      if (this.aiQuotaRemaining === -1) return this.lang.planPremium || "Pro"
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

  .ios-app-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
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

  .export, .import, .backup {
    display: inline-block;
  }

  .export:hover ::v-deep .export-dropdown,
  .export:focus-within ::v-deep .export-dropdown,
  .import:hover ::v-deep .import-dropdown,
  .import:focus-within ::v-deep .import-dropdown,
  .backup:hover ::v-deep .backup-dropdown,
  .backup:focus-within ::v-deep .backup-dropdown {
    display: block;
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
