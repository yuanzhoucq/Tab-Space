<template>
  <iframe id="bridgeStorage"
          :src="`${$myConfig.staticResourceEndpoint}/storage.html?method=get`"
          height="0"
          style="border: none"
  >
  </iframe>
</template>

<script>
import { validateSessionsArray } from '../utility';

export default {
  name: "TabSpaceBridge",
  data() {
    return {
      iframeLoaded: false
    }
  },
  computed: {
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
  },
  methods: {
    syncBookmarks(evt) {
      if (this.iframeLoaded) {
        try {
          const bookmarks = JSON.parse(evt.data.bookmarks)
          if (validateSessionsArray(bookmarks)) {
            this.sessions = bookmarks
          }
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
