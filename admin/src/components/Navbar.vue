<template>
  <nav>
    <div>
      <a class="link" href="https://www.notion.so/joyuer/What-s-New-in-Tab-Space-66063fc8afea4f54906f32ef92915ea7" 
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
    <div>
      <router-link class="link" to="/settings">{{lang.settings}}</router-link>
    </div>
  </nav>
</template>

<script>
import { mapState } from "vuex"
import ExportDropdown from "./ExportDropdown"
import ImportDropdown from "./ImportDropdown"

export default {
  name: "Navbar",
  computed: mapState(["lang", "bridge"]),
  components: {
    ExportDropdown,
    ImportDropdown
  }
};
</script>

<style scope>
  nav {
    display: flex;
    justify-content: flex-end;
  }

  nav > div {
    margin-right: 5px;
  }

  .export, .import {
    display: inline-block;
  }

  #file-input {
    position: fixed;
    right: -500px;
  }
</style>
