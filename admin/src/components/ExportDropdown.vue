<template>
  <div class="export-dropdown">
    <span class="link" data-testid="export-text" href="#" @click="exportTabs('Text')">{{lang.exportText}}</span>
    <span class="link" data-testid="export-markdown" href="#" @click="exportTabs('MD')">{{lang.exportMD}}</span>
    <span class="link" data-testid="export-html" href="#" @click="exportTabs('HTML')">{{lang.exportHTML}}</span>
    <span class="link" data-testid="export-json" href="#" @click="exportTabs('JSON')">{{lang.exportJSON}}</span>
  </div>
</template>

<script>
import { mapState } from "vuex"
import { encode } from "mdurl"
import { download, Clipboard } from "../utility.js"

export default {
  name: "ExportDropdown",
  props: ["selectedSessions"],
  computed: mapState(["lang", "sessions"]),
  methods: {
    async exportTabs(type) {
      let tabs = (this.selectedSessions || this.sessions).filter(session => (
        !(session.tags || []).some(tag => (
          (typeof tag === "string" ? tag : tag && tag.name) === "@Trash"
        ))
      ));
      let s = "";
      switch (type.toLowerCase()) {
        case "html": {
          const { buildExportHtml } = await import(/* webpackChunkName: "export-html" */ "../exportHtml")
          download(
            "Tab-Space-Exported.html",
            buildExportHtml(tabs, this.lang),
            "text/html"
          );
          break;
        }
        case "json":
          download("backup.tabspace", JSON.stringify(tabs));
          break;
        case "text":
          tabs.forEach(i => (s += this.sessionTo("text", i) + "\n\n"));
          Clipboard.copy(s);
          break;
        case "md":
          tabs.forEach(i => (s += this.sessionTo("md", i) + "\n\n"));
          Clipboard.copy(s);
          break;
        default:
          console.log("Exporting type not supported.");
      }
      let text = this.lang["export" + type];
      this.$store.commit("updateLang", {key: "export" + type, value: "OK"})
      this.lang["export" + type] = "OK";
      setTimeout(() => this.$store.commit("updateLang", {key: "export" + type, value: text}), 1000);
    },
    sessionTo(type, session) {
      let s = "";
      switch (type.toLowerCase()) {
        case "text":
          s += session.title;
          session.sites.forEach(i => {
            s += "\n- ";
            if (i.title) s += i.title + ": ";
            s += i.url;
          });
          break;
        case "md":
          s += session.title;
          session.sites.forEach(i => {
            // exclude default chars except `()`
            s += `\n- [${i.title}](${encode(i.url, ";/?:@&=+$,-_.!~*'#")})`;
          });
          break;
      }
      return s;
    }
  }
};
</script>

<style scoped>
.export-dropdown {
  display: none;
  position: absolute;
  margin-left: -40px;
  padding: 4px;
  font-size: 12px;
  border: 1px solid var(--border-color, gray);
  border-radius: 6px;
  text-align: left;
  background-color: var(--card-bg, #fbfbfb);
  min-width: 100px;
  z-index: 100;
}

.link {
  cursor: pointer;
  display: block;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.link:hover {
  background-color: rgba(0, 0, 0, 0.06);
}

@media (prefers-color-scheme: dark) {
  .export-dropdown {
    background-color: #2d2d2d;
    border-color: #444;
  }
  .link:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
}
</style>
