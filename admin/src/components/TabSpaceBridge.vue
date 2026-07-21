<template>
  <iframe id="bridgeStorage"
          v-if="bridgeModeResolved && !directMode"
          ref="bridgeStorage"
          :src="legacyBridgeUrl"
          @load="onIframeLoad"
          height="0"
          style="border: none"
          aria-hidden="true"
  >
  </iframe>
</template>

<script>
import { mapState } from 'vuex'
import Constants from '../constants'
import config from '../config'

const appExtensionEvent = name => `tabspace:app-extension:${name}`
const legacyBridgeUrl = `${config.staticResourceEndpoint}/storage.html?method=get`
const legacyBridgeOrigin = new URL(config.staticResourceEndpoint).origin

export default {
  name: "TabSpaceBridge",
  data() {
    const hasDirectBridge = Boolean(window.__tabspace_bridge)
    const directBridgeExpected = window.location.host === "app.mytab.space"
      || window.location.hostname === "localhost"
    return {
      iframeLoaded: false,
      directMode: hasDirectBridge,
      bridgeModeResolved: hasDirectBridge || !directBridgeExpected,
      directBridgeExpected,
      legacyBridgeUrl,
      minimumProtocolVersion: 1,
      protocolVersionKey: "tabspace-native-protocol-version",
      bridgeReady: false,
      appDetectionTimer: null,
      initialDataTimer: null,
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
    if (this.redirectLegacyBridgeLoopbackHost()) return
    window.addEventListener("message", this.handleWindowMessage)
    window.addEventListener("tabspace:bridge-ready", this.handleBridgeReady)
    document.addEventListener(appExtensionEvent("ready"), this.handleAppExtensionBridgeReady)
    document.addEventListener(appExtensionEvent("message"), this.handleAppExtensionMessage)
    this.startAppDetectionTimeout()
    if (window.__tabspace_bridge) {
      this.setupDirectBridge()
    } else if (this.directBridgeExpected) {
      this.probeAppExtensionBridge()
      this.detectBridge(0)
    }
  },
  beforeDestroy() {
    window.removeEventListener("message", this.handleWindowMessage)
    window.removeEventListener("tabspace:bridge-ready", this.handleBridgeReady)
    document.removeEventListener(appExtensionEvent("ready"), this.handleAppExtensionBridgeReady)
    document.removeEventListener(appExtensionEvent("message"), this.handleAppExtensionMessage)
    this.clearAppDetectionTimer()
    this.clearInitialDataTimer()
    this.clearBookmarkRefreshTimer()
  },
  methods: {
    redirectLegacyBridgeLoopbackHost() {
      if (window.__tabspace_bridge || window.location.hostname !== "127.0.0.1") return false
      const localhostUrl = new URL(window.location.href)
      localhostUrl.hostname = "localhost"
      window.location.replace(localhostUrl.toString())
      return true
    },
    detectBridge(attempt) {
      if (this.bridgeReady) return
      if (window.__tabspace_bridge) {
        this.setupDirectBridge()
        return
      }
      if (attempt < 10) {
        this.probeAppExtensionBridge()
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
    probeAppExtensionBridge() {
      document.dispatchEvent(new CustomEvent(appExtensionEvent("probe")))
    },
    handleAppExtensionBridgeReady(event) {
      try {
        const detail = JSON.parse(event.detail || "{}")
        if (Number(detail.protocolVersion || 0) < 1) return
      } catch (_) {
        return
      }
      this.setupAppExtensionBridge()
    },
    handleAppExtensionMessage(event) {
      let payload
      try {
        payload = JSON.parse(event.detail || "{}")
      } catch (_) {
        return
      }
      if (!payload || typeof payload.name !== "string") return
      const message = payload.message || {}
      this.handleNativeMessage(payload.name, {
        ...message,
        cmd: payload.name,
        bookmarks: message.value,
        source: message.source,
        id: message.id,
        value: message.value,
        backups: message.backups
      })
    },
    setupAppExtensionBridge() {
      if (this.bridgeReady && this.directMode) return
      this.clearBookmarkRefreshTimer()
      this.directMode = true
      this.bridgeModeResolved = true
      const directBridge = {
        send: msg => document.dispatchEvent(new CustomEvent(appExtensionEvent("command"), {
          detail: JSON.stringify({ name: msg.cmd, data: msg })
        })),
        mode: "direct",
        fallbackToBundled: null
      }
      this.$store.commit("setBridge", directBridge)
      this.bridgeReady = true
      this.markNativeDetected()
      this.markDashboardReady()
      this.requestInitialData(directBridge)
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
        mode: "direct",
        fallbackToBundled: typeof window.__tabspace_bridge.fallbackToBundled === "function"
          ? () => window.__tabspace_bridge.fallbackToBundled()
          : null
      }
      this.$store.commit("setBridge", directBridge)
      this.bridgeReady = true
      this.markNativeDetected()
      this.markDashboardReady()
      this.requestInitialData(directBridge)
    },
    handleWindowMessage(evt) {
      const iframe = this.$refs.bridgeStorage
      if (!iframe || evt.source !== iframe.contentWindow) return
      if (evt.origin !== legacyBridgeOrigin) return
      if (!evt.data || typeof evt.data.cmd !== "string") return

      this.handleNativeMessage(evt.data.cmd, evt.data)
    },
    onIframeLoad() {
      if (this.iframeLoaded || this.directMode) return
      console.log("Legacy bridge iframe loaded.")
      this.iframeLoaded = true
      const iframe = this.$refs.bridgeStorage
      if (!iframe) return
      const iframeBridge = {
        send: msg => iframe.contentWindow.postMessage(msg, legacyBridgeOrigin),
        mode: "iframe"
      }
      this.$store.commit("setBridge", iframeBridge)
      this.bridgeReady = true
      this.requestDefaultsOnce(iframeBridge)
    },
    handleNativeMessage(cmd, data) {
      this.markNativeDetected()
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
    markNativeDetected() {
      if (this.$store.state.nativeDetected) return
      this.$store.commit("setNativeDetected", true)
      this.$store.commit("setConnectionTimedOut", false)
      this.clearAppDetectionTimer()
      this.startInitialDataTimeout()
    },
    startAppDetectionTimeout() {
      this.clearAppDetectionTimer()
      this.appDetectionTimer = setTimeout(() => {
        if (!this.$store.state.nativeDetected) {
          this.$store.commit("setConnectionTimedOut", true)
        }
      }, 3000)
    },
    startInitialDataTimeout() {
      this.clearInitialDataTimer()
      this.initialDataTimer = setTimeout(() => {
        if (!this.initialRefresh) {
          this.$store.commit("setConnectionTimedOut", true)
        }
      }, 8000)
    },
    clearAppDetectionTimer() {
      if (this.appDetectionTimer) {
        clearTimeout(this.appDetectionTimer)
        this.appDetectionTimer = null
      }
    },
    clearInitialDataTimer() {
      if (this.initialDataTimer) {
        clearTimeout(this.initialDataTimer)
        this.initialDataTimer = null
      }
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
          this.clearInitialDataTimer()
          this.$store.commit("setConnectionTimedOut", false)
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
