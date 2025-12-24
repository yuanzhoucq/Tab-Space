<template>
  <div>
    <div class="import-dropdown">
    <span>
      <label for="file-input" class="link">
        {{lang.import}}(<code>.tabspace</code>)
      </label>
      <input type="file" id="file-input" @change="importTabs" accept=".tabspace" />
    </span>
    <span class="link" href="#" @click="displayImportOneTab">{{lang.import}} OneTab</span>
    </div>
    <div id="import-modal">
      <h3 style="margin-left: 20px">{{lang.import}} OneTab</h3>
      <textarea name="" id="import-content" cols="80" rows="30" 
      style="margin: 0 auto; display: block;"></textarea>
       <span class="link" href="#" @click="cancelImport" 
      style="float:right; margin: 10px; border: #dddddd 1px solid; padding: 3px 8px; border-radius: 4px;">{{lang.cancel}}</span>
      <span class="link" href="#" @click="importOneTab" 
      style="float:right; margin: 10px 0px 10px 10px; border: #dddddd 1px solid; padding: 3px 8px; border-radius: 4px;">{{lang.import}}</span>
    </div>
  </div>
</template>

<script>
import { mapState } from "vuex"
import { validateSessions, validURL } from "../utility"

export default {
  name: "ExportDropdown",
  props: ["selectedSessions"],
  computed: mapState(["lang", "bridge"]),
  mounted() {
    this.color = document.querySelector("#import-modal").style.color
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
        if (validateSessions(importedSessions)) this.bridge.send({ cmd: "AppendSessions", bookmarks: importedSessions });
      };
      file.readAsText(e.target.files[0]);
    },
    displayImportOneTab() {
      document.querySelector("#import-modal").style.display = "block"
    },
    cancelImport() {
      document.querySelector("#import-modal").style.display = "none"
    },
    importOneTab() {
      let importedSessions = document.querySelector("#import-content").value
      document.querySelector("#import-modal").style.color = this.color
      importedSessions = importedSessions.split("\n\n")
      importedSessions = importedSessions.map(session => {
        let sites = []
        session.split("\n").forEach(site => {
          const s = {
            title: site.slice(site.indexOf(" | ") + 3),
            url: site.slice(0, site.indexOf(" | "))
          }
          if (validURL(s.url) && s.url !== s.title) sites.push(s)
        })
        return {
          timestamp: parseInt(Date.now() / 1000),
          sites: sites,
          title: "From OneTab",
          tags: []
        }
      })
      console.log(importedSessions)
      if (validateSessions(importedSessions)) {
        this.bridge.send({ cmd: "AppendSessions", bookmarks: importedSessions });
        document.querySelector("#import-content").value = ""
        document.querySelector("#import-modal").style.display = "none"
      } else {
        document.querySelector("#import-modal").style.color = "red"
      }
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

#file-input {
  display: none;
}

#import-modal {
  display: none;
  position: absolute;
  width: 50vw;
  top: 20vh;
  left: 25vw;
  right: 25vw;
  z-index: 1000;
  background-color: #fbfbfb;
  border-radius: 10px;
  border: #eeeeee 1px solid;
}

@media (prefers-color-scheme: dark) {
  .import-dropdown, #import-modal {
    background-color: #2d2d2d;
    border-color: #444;
  }
  .import-dropdown .link:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
}
</style>
