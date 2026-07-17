<template>
  <nav>
    <div>
      <a class="link" href="https://joyuer.notion.site/What-s-New-in-Tab-Space-66063fc8afea4f54906f32ef92915ea7" 
        target="_blank" style="text-decoration: none; font-style: italic" v-html="lang.whatsNew"></a>
    </div>
    <div v-if="activeTag !== '@Trash'" class="export" data-testid="export-menu">
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
    <div>
      <router-link class="link" data-testid="settings-link" to="/settings">{{lang.settings}}</router-link>
    </div>
  </nav>
</template>

<script>
import { mapState } from "vuex"
import ExportDropdown from "./ExportDropdown"
import ImportDropdown from "./ImportDropdown"
import BackupDropdown from "./BackupDropdown"

export default {
  name: "Navbar",
  computed: mapState(["lang", "bridge", "activeTag"]),
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
