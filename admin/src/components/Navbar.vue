<template>
  <nav>
    <div>
      <a class="link" href="https://joyuer.notion.site/What-s-New-in-Tab-Space-66063fc8afea4f54906f32ef92915ea7" 
        target="_blank" style="text-decoration: none; font-style: italic" v-html="lang.whatsNew"></a>
    </div>
    <div class="export">
      <span class="link">
        {{lang.export}}
        <small>▼</small>
      </span>
      <export-dropdown></export-dropdown>
    </div>
    <div class="import">
      <span class="link">
        {{lang.import}}
        <small>▼</small>
      </span>
      <import-dropdown></import-dropdown>
    </div>
    <div class="backup">
      <span class="link">
        {{lang.backup || 'Backup'}}
        <small>▼</small>
      </span>
      <backup-dropdown></backup-dropdown>
    </div>
    <div>
      <router-link class="link" to="/settings">{{lang.settings}}</router-link>
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
  computed: mapState(["lang", "bridge"]),
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
    margin-top: 8px;
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
  .import:hover ::v-deep .import-dropdown,
  .backup:hover ::v-deep .backup-dropdown {
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

