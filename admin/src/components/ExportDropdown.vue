<template>
  <div class="export-dropdown">
    <span class="link" href="#" @click="exportTabs('Text')">{{lang.exportText}}</span>
    <br />
    <span class="link" href="#" @click="exportTabs('MD')">{{lang.exportMD}}</span>
    <br />
    <span class="link" href="#" @click="exportTabs('HTML')">{{lang.exportHTML}}</span>
    <br />
    <span class="link" href="#" @click="exportTabs('JSON')">{{lang.exportJSON}}</span>
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
    exportTabs(type) {
      let tabs = this.selectedSessions || this.sessions;
      let s = "";
      switch (type.toLowerCase()) {
        case "html":
          s = tabs.map(session => [
            session.timestamp, 
            session.sites.map(s => [s.title, s.url]),
            session.title,
            session.tags.map(t => t.name)
            ])
          fetch("export.html")
            .then(r => r.text())
            .then(r => {
              let content = r.replace(
                'JSON.parse(localStorage.getItem("bookmarks") || "[]")',
                JSON.stringify(s)
              );
              content = content.replace(
                "<h1>Tab Space</h1>",
                `<h1>{{lang.exportTitle}}</h1>`
              );
              content = content.replace(
                `lang: {}`,
                `lang: ${JSON.stringify(this.lang)}`
              );
              download("Tab-Space-Exported.html", content);
            });
          break;
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
  padding: 3px;
  font-size: 12px;
  border: 1px solid gray;
  border-radius: 5px;
  text-align: left;
  background-color: #fbfbfb;
}

.link {
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .export-dropdown {
    background-color: #353535;
  }
}
</style>
