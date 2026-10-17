<template>
  <div class="import-dropdown">
    <span>
      <label for="file-input" class="link">
        {{lang.import}}(<code>.tabspace</code>)
      </label>
      <input type="file" id="file-input" @change="importFile" accept=".tabspace,.json" />
    </span>
    <span>
      <label for="tabxpert-file-input" class="link" data-testid="import-tabxpert">
        {{lang.import}} <span>TabXpert</span>(<code>.json</code>)
      </label>
      <input type="file" id="tabxpert-file-input" data-testid="import-tabxpert-input"
             @change="importFile" accept=".json" />
    </span>
    <span class="link" data-testid="import-onetab" @click="$emit('open-onetab')">{{lang.import}} OneTab</span>
    <!-- Every importer here exists because someone had a real export from
         that app; this asks for the next one, sample file included. -->
    <a class="link import-request" data-testid="import-request" :href="requestUrl">{{lang.importOtherSource}}</a>
  </div>
</template>

<script>
import { mapState } from "vuex"
import BuildInfo from "../build-info"
import { supportEmail } from "../app-store"
import { exceedsImportLimit, parseImportFile } from "../importers"
import { validateSessions } from "../utility"

export default {
  name: "ImportDropdown",
  computed: {
    ...mapState(["lang", "bridge"]),
    requestUrl() {
      const subject = encodeURIComponent(this.lang.importRequestSubject)
      const body = encodeURIComponent(`${this.lang.importRequestBody}\n\n---\nTab Space dashboard ${BuildInfo.shortSha}`)
      return `mailto:${supportEmail}?subject=${subject}&body=${body}`
    }
  },
  methods: {
    importFile(e) {
      const input = e.target
      const file = new FileReader();
      file.onload = e => {
        let importedSessions
        try {
          importedSessions = parseImportFile(e.target.result)
        } catch (error) {
          console.error("Import failed", error)
          return
        }
        if (importedSessions.length > 0 && validateSessions(importedSessions)) {
          if (exceedsImportLimit(importedSessions)) {
            this.$store.commit("setAIToast", { messageKey: "importTooLarge", retry: null })
            return
          }
          this.bridge.send({ cmd: "AppendSessions", bookmarks: importedSessions });
        }
      };
      file.readAsText(input.files[0]);
      // Let the same file be picked again, e.g. after fixing it.
      input.value = ""
    }
  }
};
</script>

<style scoped>
.import-dropdown {
  display: none;
  position: absolute;
  margin-left: -40px;
  padding: 4px;
  font-size: 12px;
  border: 1px solid var(--border-color, gray);
  border-radius: 6px;
  text-align: left;
  background-color: var(--card-bg, #fbfbfb);
  white-space: nowrap;
  z-index: 100;
}

.import-dropdown .link {
  display: block;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
  cursor: pointer;
  white-space: nowrap;
}

.import-dropdown .link:hover {
  background-color: rgba(0, 0, 0, 0.06);
}

.import-dropdown .import-request {
  color: var(--text-secondary, #718096);
  text-decoration: none;
}

#file-input,
#tabxpert-file-input {
  display: none;
}

@media (prefers-color-scheme: dark) {
  .import-dropdown {
    background-color: #2d2d2d;
    border-color: #444;
  }
  .import-dropdown .link:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
}
</style>
