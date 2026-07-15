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
    const directBridgeExpected = window.location.host === "app.mytab.space"
    return {
      iframeLoaded: false,
      directMode: hasDirectBridge,
      bridgeModeResolved: true,
      directBridgeExpected,
      minimumProtocolVersion: 1,
      protocolVersionKey: "tabspace-native-protocol-version",
      bridgeReady: false,
      bookmarkRefreshTimer: null,
      bookmarkRefreshAttempt: 0,
      defaultsRequested: false
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
    window.addEventListener("tabspace:bridge-ready", this.handleBridgeReady)
    if (window.__tabspace_bridge) {
      this.setupDirectBridge()
    } else if (this.directBridgeExpected) {
      this.detectBridge(0)
    }
  },
  beforeDestroy() {
    window.removeEventListener("message", this.handleWindowMessage)
    window.removeEventListener("tabspace:bridge-ready", this.handleBridgeReady)
    this.clearBookmarkRefreshTimer()
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
    handleBridgeReady() {
      if (window.__tabspace_bridge) {
        this.setupDirectBridge()
      }
    },
    setupDirectBridge() {
      if (this.bridgeReady && this.directMode) return
      this.clearBookmarkRefreshTimer()
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
      if (this.directMode) return
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
      this.requestDefaultsOnce(iframeBridge)
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
        case "SessionsChangedRemotely":
          // Native side merged an iCloud / app-group change (Tab Space 3.16+)
          // and asks us to pick up the fresh data.
          console.log("Sessions changed remotely; refreshing bookmarks.")
          if (this.bridge) this.bridge.send({cmd: "CheckBookmarks"})
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
        this.startBookmarkRefresh(bridge)
        return
      }
      this.requestDefaultsOnce(bridge)
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
      }
      else setTimeout(() => this.checkDefaults(), 200)
    },
    requestDefaultsOnce(bridge = this.bridge) {
      if (this.defaultsRequested) return
      if (!bridge) {
        setTimeout(() => this.requestDefaultsOnce(), 200)
        return
      }
      this.defaultsRequested = true
      this.checkDefaults(bridge)
    },
    startBookmarkRefresh(bridge = this.bridge) {
      if (!bridge || !this.directMode || this.initialRefresh) return
      this.bookmarkRefreshAttempt = 0
      this.sendBookmarkRefresh(bridge)
    },
    sendBookmarkRefresh(bridge = this.bridge) {
      if (!bridge || !this.directMode || this.initialRefresh) {
        this.clearBookmarkRefreshTimer()
        return
      }
      bridge.send({cmd: "CheckBookmarks"})
      const delay = Math.min(250 * Math.pow(1.5, this.bookmarkRefreshAttempt), 2000)
      this.bookmarkRefreshAttempt += 1
      this.clearBookmarkRefreshTimer()
      this.bookmarkRefreshTimer = setTimeout(() => this.sendBookmarkRefresh(bridge), delay)
    },
    clearBookmarkRefreshTimer() {
      if (this.bookmarkRefreshTimer) {
        clearTimeout(this.bookmarkRefreshTimer)
        this.bookmarkRefreshTimer = null
      }
    },
    syncBookmarks(data) {
      if (this.bridgeReady) {
        try {
          const bookmarks = typeof data.bookmarks === "string" ? JSON.parse(data.bookmarks) : data.bookmarks
          this.sessions = bookmarks
          this.clearBookmarkRefreshTimer()
          this.requestDefaultsOnce()
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
