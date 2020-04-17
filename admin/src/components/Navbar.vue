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
        let importedSessions = JSON.parse(e.target.result);
        if (Array.isArray(importedSessions[0])) {
          importedSessions = importedSessions.map(session => {
            return {
              timestamp: parseInt(session[0] / 1000),
              sites: session[1].map(s => { return {title: s[0], url: s[1]} }),
              title: session[2],
              tags: session[3] ? session[3].map(t => { return {name: t} }) : []
            }
          })
        }
        console.log(importedSessions)
        this.bridge.send({ cmd: "AppendSessions", bookmarks: importedSessions });
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
