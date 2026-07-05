<template>
  <iframe id="bridgeStorage"
          v-if="bridgeModeResolved && !directMode"
          ref="bridgeStorage"
          :src="`${$myConfig.staticResourceEndpoint}/storage.html?method=get`"
          @load="onIframeLoad"
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
    const hasDirectBridge = Boolean(window.__tabspace_bridge)
    return {
      iframeLoaded: false,
      directMode: hasDirectBridge,
      bridgeModeResolved: hasDirectBridge,
      minimumProtocolVersion: 1,
      protocolVersionKey: "tabspace-native-protocol-version",
      bridgeReady: false
    }
  },
  computed: {
    ...mapState(["bridge", "initialRefresh"]),
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
    window.addEventListener("message", this.handleWindowMessage)
    this.detectBridge(0)
  },
  beforeDestroy() {
    window.removeEventListener("message", this.handleWindowMessage)
  },
  methods: {
    detectBridge(attempt) {
      if (this.bridgeReady) return
      if (window.__tabspace_bridge) {
        this.setupDirectBridge()
        return
      }
      if (attempt < 10) {
        setTimeout(() => this.detectBridge(attempt + 1), 100)
        return
      }
      this.bridgeModeResolved = true
    },
    setupDirectBridge() {
      if (this.bridgeReady) return
      this.directMode = true
      this.bridgeModeResolved = true
      window.__tabspace_bridge.onMessage = (name, message) => {
        this.handleNativeMessage(name, {
          cmd: name,
          bookmarks: message && message.value,
          source: message && message.source,
          id: message && message.id,
          value: message && message.value,
          backups: message && message.backups
        })
      }
      const directBridge = {
        send: msg => window.__tabspace_bridge.send(msg.cmd, msg),
        mode: "direct"
      }
      this.$store.commit("setBridge", directBridge)
      this.bridgeReady = true
      this.markDashboardReady()
      this.requestInitialData(directBridge)
      this.startBridgeTimeout()
    },
    handleWindowMessage(evt) {
      // Filter out other sites' postMessage
      if (
        !evt.origin.includes("joyuer.cn")
        && !evt.origin.includes("mytab.space")
        && !evt.origin.includes("yuanzhoucq.github.io")
      ) return

      this.handleNativeMessage(evt.data.cmd, evt.data)
    },
    onIframeLoad() {
      if (this.iframeLoaded) return
      console.log("Bridge iframe loaded.")
      this.iframeLoaded = true
      const iframe = this.$refs.bridgeStorage
      if (!iframe) return
      const iframeBridge = {
        send: msg => iframe.contentWindow.postMessage(msg, "*"),
        mode: "iframe"
      }
      this.$store.commit("setBridge", iframeBridge)
      this.bridgeReady = true
      this.requestInitialData(iframeBridge)
    },
    handleNativeMessage(cmd, data) {
      window.dispatchEvent(new CustomEvent("tabspace:native-message", {
        detail: data
      }))

      switch (cmd) {
        case "ReturnBookmarks":
          console.log("Received checked bookmarks from Tab Space.app.")
          this.syncBookmarks(data)
          break
        case "ReturnDefault":
          this.handleDefault(data)
          break
      }
    },
    handleDefault(data) {
      if (data.id === this.protocolVersionKey) {
        const version = Number(data.value || 0)
        if (version > 0 && version < this.minimumProtocolVersion) {
          window.alert("This Tab Space app version is too old for the online dashboard. Please update Tab Space.")
        }
        return
      }
      this.$store.commit("setTabSpaceSetting", {key: data.id, value: data.value})
    },
    markDashboardReady() {
      if (window.__tabspace_bridge && typeof window.__tabspace_bridge.markReady === "function") {
        window.__tabspace_bridge.markReady()
      }
      window.dispatchEvent(new CustomEvent("tabspace:dashboard-ready"))
    },
    requestInitialData(bridge = this.bridge) {
      if (bridge && this.directMode) {
        bridge.send({cmd: "CheckBookmarks"})
        setTimeout(() => this.checkDefaults(bridge), 0)
        return
      }
      this.checkDefaults(bridge)
    },
    startBridgeTimeout() {
      setTimeout(() => {
        if (this.initialRefresh) return
        const fallback = window.__tabspace_bridge && window.__tabspace_bridge.fallbackToBundled
        if (fallback && window.confirm("Tab Space could not connect to the app. Open the bundled dashboard instead?")) {
          fallback()
        }
      }, 8000)
    },
    checkDefaults(bridge = this.bridge) {
      if (bridge) {
        bridge.send({cmd: "CheckDefault", name: this.protocolVersionKey})
        bridge.send({cmd: "CheckDefault", name: Constants.preferredLanguageKey})
        bridge.send({cmd: "CheckDefault", name: Constants.externalBrowser1Key})
        bridge.send({cmd: "CheckDefault", name: Constants.externalBrowser2Key})
        Constants.settings.forEach(setting => {
          bridge.send({cmd: "CheckDefault", name: setting})
        });
        bridge.send({cmd: "CheckDefault", name: "notification-count"})
      }
      else setTimeout(() => this.checkDefaults(), 200)
    },
    syncBookmarks(data) {
      if (this.bridgeReady) {
        try {
          const bookmarks = typeof data.bookmarks === "string" ? JSON.parse(data.bookmarks) : data.bookmarks
          this.sessions = bookmarks
        } catch (e) {
          console.log("Synced bookmarks are not valid.")
        }
      } else {
        setTimeout(() => this.syncBookmarks(data), 200)
      }
    }
  }
}
</script>

<style>

</style>
