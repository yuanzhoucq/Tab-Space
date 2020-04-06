<template>
  <nav>
    <div class="export">
      <span class="link">
        {{lang.export}}
        <small>▼</small>
      </span>
      <export-dropdown></export-dropdown>
    </div>
    <div>
      <label for="file-input" class="link">
        {{lang.import}}<small>(<code>.tabspace</code>)</small>
      </label>
      <input type="file" id="file-input" @change="importTabs" accept=".tabspace" />
    </div>
    <div>
      <router-link class="link" to="/settings">{{lang.settings}}</router-link>
    </div>
  </nav>
</template>

<script>
import { mapState } from "vuex"
import ExportDropdown from "./ExportDropdown"
import { validateSessionsArray } from '../utility.js'

export default {
  name: "Navbar",
  computed: mapState(["lang", "bridge"]),
  components: {
    ExportDropdown
  },
  methods: {
    importTabs(e) {
      const file = new FileReader();
      file.onload = e => {
        const importedSessions = JSON.parse(e.target.result);
        if (!validateSessionsArray(importedSessions))
          alert("Error: invalid data!");
        else {
          this.bridge.send({ cmd: "AppendSession", bookmarks: importedSessions });
        }
      };
      file.readAsText(e.target.files[0]);
    }
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

  .export {
    display: inline-block;
  }

  #file-input {
    position: fixed;
    right: -500px;
  }
</style>
