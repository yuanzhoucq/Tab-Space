<template>
  <div style="margin-left: 30px; transition: 0.3s">
      <div @click="insertSession">
          <v-icon class="button" :stroke-width="1.2" name="plus-circle" fill="rgba(0, 181, 29, 0.2)" 
      stroke="rgb(0, 181, 29)"></v-icon>
      </div>
      <div @click="toggleCollapse">
          <v-icon class="button" :stroke-width="1.5" :name="collapse ? 'maximize' : 'minimize'" 
      :stroke="'rgb(0, 181, 29)'" style="width:26px;margin-left:2px"></v-icon>
      </div>
      <div @click="emptyTrash" v-if="activeTag === '@Trash'">
          <v-icon class="button" :stroke-width="1.2" name="trash" fill="rgba(0, 181, 29, 0.2)" 
      stroke="rgb(0, 181, 29)"></v-icon>
      </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
export default {
    computed: {
      ...mapState(["bridge", "sessions", "collapse", "activeTag"]),
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
.button {
    width: 30px;
    cursor: pointer;
}

.button:hover {
    opacity: 0.7;
}
</style>