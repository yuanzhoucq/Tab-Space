<template>
  <div class="session-hub">
      <button type="button" class="hub-btn" data-testid="add-session" :aria-label="lang.newSession" :title="lang.newSession" @click="insertSession">
          <v-icon class="button" :stroke-width="1.2" name="plus-circle" fill="rgba(250, 128, 114, 0.2)"
      stroke="salmon"></v-icon>
      </button>
      <button type="button" class="hub-btn" data-testid="toggle-collapse" :aria-label="lang.collapseSessions" :title="lang.collapseSessions" @click="toggleCollapse">
          <v-icon class="button" :stroke-width="1.5" :name="collapse ? 'maximize' : 'minimize'"
      stroke="salmon" style="width:26px;margin-left:2px"></v-icon>
      </button>
      <button type="button" class="hub-btn" data-testid="empty-trash" :aria-label="lang.emptyTrash" :title="lang.emptyTrash" @click="emptyTrash" v-if="activeTag === '@Trash'">
          <v-icon class="button" :stroke-width="1.2" name="trash" fill="rgba(235, 82, 5, 0.2)"
      stroke="rgb(235, 82, 5)"></v-icon>
      </button>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
export default {
    computed: {
      ...mapState(["lang", "bridge", "sessions", "collapse", "activeTag"]),
      ...mapGetters(["displaySessions"]),
    },
    methods: {
        insertSession() {
            let timestamp = (new Date()).getTime()
            let newSession = {
                uuid: "new-" + timestamp,
                title: "",
                timestamp,
                sites: [],
                tags: this.activeTag ? [{name: this.activeTag}] : []
            }
            this.$store.commit("spliceSessions", {start: 0, deleteCount: 0, items: [newSession]})
        },
        toggleCollapse() {
            this.$store.commit("toggleCollapse")
        },
        emptyTrash() {
            this.bridge.send({ cmd: "DeleteSession", bookmarks: this.sessions.filter(s => s.tags.map(t => t.name).includes("@Trash")) })
        }
    }
}
</script>

<style scoped>
.session-hub {
    margin-left: 15px;
    transition: 0.3s;
}

.hub-btn {
    background: transparent;
    border: 0;
    padding: 0;
    display: block;
}

.button {
    width: 30px;
    cursor: pointer;
}

.button:hover {
    opacity: 0.7;
}
</style>
