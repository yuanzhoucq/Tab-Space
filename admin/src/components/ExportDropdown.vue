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
import { mapState } from "vuex";
import { download, Clipboard } from "../utility.js";

export default {
  name: "ExportDropdown",
  props: ["selectedSessions"],
  computed: mapState(["lang", "sessions"]),
  methods: {
    exportTabs(type) {
      let tabs = this.selectedSessions || this.sessions;
      let s = "";
      let exported;
      switch (type.toLowerCase()) {
        case "html":
          fetch("export.html")
            .then(r => r.text())
            .then(r => {
              let content = r.replace(
                'JSON.parse(localStorage.getItem("bookmarks") || "[]")',
                JSON.stringify(tabs)
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
          exported = tabs.map(session => {
            let s = [...session];
            s[0] = String(1 + Number(s[0]));
            return s;
          });
          download("backup.tabspace", JSON.stringify(exported));
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
          s +=
            session[2] ||
            `${this.lang.saveAt} ${new Date(Number(session[0])).Format(
              "yyyy-MM-dd hh:mm"
            )}`;
          session[1].forEach(i => {
            s += "\n- ";
            if (i[0]) s += i[0] + ": ";
            s += i[1];
          });
          break;
        case "md":
          s +=
            "# " +
            (session[2] ||
              `${this.lang.saveAt} ${new Date(Number(session[0])).Format(
                "yyyy-MM-dd hh:mm"
              )}`);
          session[1].forEach(i => {
            s += `\n- [${i[0]}](${i[1]})`;
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
  font-size: 14px;
  border: 1px solid gray;
  border-radius: 5px;
  text-align: left;
  background-color: #fbfbfb;
}

@media (prefers-color-scheme: dark) {
  .export-dropdown {
    background-color: #353535;
  }
}
</style>
