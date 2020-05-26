<template>
  <div style="margin-left: 30px; transition: 0.3s">
      <div @click="insertSession">
          <v-icon class="button" :stroke-width="1.2" name="plus-circle" fill="rgba(0, 181, 29, 0.2)" 
      stroke="rgb(0, 181, 29)"></v-icon>
      </div>
      <div @click="toggleCollapse">
          <v-icon class="button" :stroke-width="1.2" name="align-justify" 
      :stroke="collapse ? 'rgb(0, 181, 29)' : 'rgb(0, 0, 0)'"></v-icon>
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
                tags: []
            }
            this.displaySessions.unshift(newSession)
        },
        toggleCollapse() {
            this.$store.commit("toggleCollapse")
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