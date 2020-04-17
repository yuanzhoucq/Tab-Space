<template>
  <iframe id="bridgeStorage"
          :src="`${$myConfig.staticResourceEndpoint}/storage.html?method=get`"
          height="0"
          style="border: none"
  >
  </iframe>
</template>

<script>
import { mapState } from 'vuex'
import Constants from '../constants'

export default {
  name: "TabSpaceBridge",
  data() {
    return {
      iframeLoaded: false
    }
  },
  computed: {
    ...mapState(["bridge"]),
    sessions: {
      get() {
        return this.$store.state.sessions;
      },
      set(value) {
        this.$store.commit("setSessions", value)
      }
    },
  },
  mounted() {
    this.iframe = document.querySelector("#bridgeStorage")
    this.iframe.onload = () => {
      console.log("Bridge iframe loaded.")
      this.iframeLoaded = true
      this.$store.commit("setBridge", {
        send: msg => this.iframe.contentWindow.postMessage(msg, "*")
      })
    }
    window.addEventListener("message", evt => {
      // Filter out other sites' postMessage
      if (!evt.origin.includes("joyuer.cn") && !evt.origin.includes("yuanzhoucq.github.io")) return
      switch (evt.data.cmd) {
        case "ReturnBookmarks":
          console.log("Received checked bookmarks from Tab Space.app.")
          this.syncBookmarks(evt)
          break
        case "ReturnDefault":
          this.$store.commit("setTabSpaceSetting", {key: evt.data.id, value: evt.data.value})
      }
    })
    this.checkDefaults()
  },
  methods: {
    checkDefaults() {
      if (this.bridge) {
        this.bridge.send({cmd: "CheckDefault", name: Constants.preferredLanguageKey})
        Constants.settings.forEach(setting => {
          this.bridge.send({cmd: "CheckDefault", name: setting})
        });
      }
      else setTimeout(this.checkDefaults, 200)
    },
    syncBookmarks(evt) {
      if (this.iframeLoaded) {
        try {
          const bookmarks = JSON.parse(evt.data.bookmarks)
          this.sessions = bookmarks
        } catch (e) {
          console.log("Synced bookmarks are not valid.")
        }
      } else {
        setTimeout(() => this.syncBookmarks(evt), 200)
      }
    }
  }
}
</script>

<style>

</style>
