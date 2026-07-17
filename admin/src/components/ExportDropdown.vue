<template>
  <div class="export-dropdown">
    <button class="link" type="button" data-testid="export-text" @click="exportTabs('Text')">{{lang.exportText}}</button>
    <button class="link" type="button" data-testid="export-markdown" @click="exportTabs('MD')">{{lang.exportMD}}</button>
    <button class="link" type="button" data-testid="export-html" @click="exportTabs('HTML')">{{lang.exportHTML}}</button>
    <button class="link" type="button" data-testid="export-json" @click="exportTabs('JSON')">{{lang.exportJSON}}</button>
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
      try {
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
            download(
              `Tab-Space-Backup-${this.exportTimestamp()}.tabspace`,
              JSON.stringify(tabs),
              "application/json"
            );
            break;
          case "text":
            tabs.forEach(session => (s += this.sessionTo("text", session) + "\n\n"));
            await Clipboard.copy(s);
            break;
          case "md":
            tabs.forEach(session => (s += this.sessionTo("md", session) + "\n\n"));
            await Clipboard.copy(s);
            break;
          default:
            return;
        }

        const key = "export" + type;
        const text = this.lang[key];
        this.$store.commit("updateLang", {key, value: "OK"})
        setTimeout(() => this.$store.commit("updateLang", {key, value: text}), 1000);
      } catch (error) {
        console.warn("Export failed", error);
      }
    },
    exportTimestamp() {
      const date = new Date();
      const pad = value => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    },
    singleLine(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    },
    sessionTitle(session) {
      const title = this.singleLine(session.title);
      if (title) return title;

      const date = new Date(Number(session.timestamp));
      const timestamp = Number.isNaN(date.getTime())
        ? ""
        : date.Format("yyyy-MM-dd hh:mm");
      return `${this.lang.saveAt || "Saved at"}${timestamp ? " " + timestamp : ""}`;
    },
    escapeMarkdown(value) {
      return this.singleLine(value).replace(/([\\`*_[\]<>])/g, "\\$1");
    },
    sessionTo(type, session) {
      let s = this.sessionTitle(session);
      switch (type.toLowerCase()) {
        case "text":
          session.sites.forEach(i => {
            s += "\n- ";
            const title = this.singleLine(i.title);
            if (title) s += title + ": ";
            s += this.singleLine(i.url);
          });
          break;
        case "md":
          s = `## ${this.escapeMarkdown(s)}`;
          session.sites.forEach(i => {
            const url = this.singleLine(i.url);
            const title = this.escapeMarkdown(i.title || url);
            s += `\n- [${title}](${encode(url, ";/?:@&=+$,-_.!~*'#")})`;
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
  width: 100%;
  padding: 4px 8px;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 4px;
  font: inherit;
  text-align: left;
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
