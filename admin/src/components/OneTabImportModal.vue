<template>
  <!-- Rendered by Navbar outside the More menu: that menu only exists while it
       is hovered, so a dialog inside it vanished as soon as the pointer moved
       on to the text box, and was positioned off the right edge besides. -->
  <div class="onetab-import-overlay" @click.self="close">
    <div class="onetab-import-modal" role="dialog" aria-modal="true"
         aria-labelledby="onetab-import-title" data-testid="import-modal">
      <h3 id="onetab-import-title">{{lang.import}} OneTab</h3>
      <textarea id="import-content" ref="content" v-model="content"
                :class="{ invalid }" rows="16"
                :placeholder="placeholder"
                @input="invalid = false"></textarea>
      <div class="actions">
        <button type="button" class="secondary-action" @click="close">{{lang.cancel}}</button>
        <button type="button" class="primary-action" data-testid="import-submit"
                @click="submit">{{lang.import}}</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from "vuex"
import { parseOneTab } from "../importers"
import { validateSessions } from "../utility"

export default {
  name: "OneTabImportModal",
  data() {
    return { content: "", invalid: false, placeholder: "https://example.com | Example" }
  },
  computed: mapState(["lang", "bridge"]),
  mounted() {
    this.$refs.content.focus()
    document.addEventListener("keydown", this.onKeydown)
  },
  beforeDestroy() {
    document.removeEventListener("keydown", this.onKeydown)
  },
  methods: {
    onKeydown(event) {
      if (event.key === "Escape") this.close()
    },
    close() {
      this.$emit("close")
    },
    submit() {
      const importedSessions = parseOneTab(this.content)
      if (importedSessions.length === 0 || !validateSessions(importedSessions)) {
        this.invalid = true
        return
      }
      this.bridge.send({ cmd: "AppendSessions", bookmarks: importedSessions })
      this.close()
    }
  }
}
</script>

<style scoped>
.onetab-import-overlay {
  position: fixed;
  margin: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1140;
  backdrop-filter: blur(4px);
}

.onetab-import-modal {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #2d3748);
  border-radius: 16px;
  width: 90%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 20px 24px;
  box-sizing: border-box;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: left;
}

h3 {
  margin: 0 0 12px;
}

textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: inherit;
  background: transparent;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  resize: vertical;
}

textarea.invalid {
  border-color: #e53e3e;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.primary-action,
.secondary-action {
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.primary-action {
  background: #fa8072;
  color: #ffffff;
}

.primary-action:hover {
  background: #f4685a;
}

.secondary-action {
  background: transparent;
  color: var(--text-primary, #2d3748);
  border-color: var(--border-color, #e2e8f0);
}

.secondary-action:hover {
  background: var(--hover-bg, #f7fafc);
}
</style>
