<template>
  <iframe id="bridgeStorage"
          v-if="bridgeModeResolved && !directMode && !webExtensionMode"
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

// Origins where the browser extension injects its content script: production,
// the local development server, and Cloudflare Pages preview deployments,
// which get a new hostname per branch. Keep this in sync with
// DASHBOARD_ORIGINS / DASHBOARD_ORIGIN_SUFFIXES in extension/src.
const WEB_EXTENSION_ORIGINS = ["https://app.mytab.space", "http://127.0.0.1:8080"]
const WEB_EXTENSION_ORIGIN_SUFFIXES = ["tab-space-admin.pages.dev"]

export default {
  name: "TabSpaceBridge",
  data() {
    const hasDirectBridge = Boolean(window.__tabspace_bridge)
    const directBridgeExpected = window.location.host === "app.mytab.space"
      || window.location.hostname === "localhost"
    return {
      iframeLoaded: false,
      directMode: hasDirectBridge,
      webExtensionMode: false,
      bridgeModeResolved: !directBridgeExpected || hasDirectBridge,
      directBridgeExpected,
      legacyBridgeUrl,
      minimumProtocolVersion: 1,
      protocolVersionKey: "tabspace-native-protocol-version",
      bridgeReady: false,
      appDetectionTimer: null,
      initialDataTimer: null,
      bookmarkRefreshTimer: null,
      bookmarkRefreshAttempt: 0,
      defaultsRequested: false,
      webExtensionRequestId: 0,
      aiInitialized: false
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
    window.addEventListener("tabspace:prepare-ai", this.prepareAI)
    document.addEventListener(appExtensionEvent("ready"), this.handleAppExtensionBridgeReady)
    document.addEventListener(appExtensionEvent("message"), this.handleAppExtensionMessage)
    document.addEventListener("visibilitychange", this.handleVisibilityChange)
    this.startAppDetectionTimeout()
    this.probeWebExtension()
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
    window.removeEventListener("tabspace:prepare-ai", this.prepareAI)
    document.removeEventListener(appExtensionEvent("ready"), this.handleAppExtensionBridgeReady)
    document.removeEventListener(appExtensionEvent("message"), this.handleAppExtensionMessage)
    document.removeEventListener("visibilitychange", this.handleVisibilityChange)
    this.clearAppDetectionTimer()
    this.clearInitialDataTimer()
    this.clearBookmarkRefreshTimer()
  },
  methods: {
    redirectLegacyBridgeLoopbackHost() {
      // The extension injects into the exact loopback development origin, so
      // redirecting it to localhost would drop the extension bridge.
      if (window.__tabspace_bridge || window.location.hostname !== "127.0.0.1") return false
      if (this.isWebExtensionDashboardOrigin(window.location.origin)) return false
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
      this.webExtensionMode = false
      this.bridgeModeResolved = true
      window.__tabspace_bridge.onMessage = (name, message) => {
        // Spread the raw payload first so reply-specific fields (status,
        // quotaRemaining, quotaResetAt, redirected, error, title, tags,
        // clusters, suggestions, …) survive; the explicit keys below keep the
        // long-standing bookmark mapping unchanged.
        this.handleNativeMessage(name, {
          ...(message || {}),
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
      if (this.handleWebExtensionMessage(evt)) return
      const iframe = this.$refs.bridgeStorage
      if (!iframe || evt.source !== iframe.contentWindow) return
      if (evt.origin !== legacyBridgeOrigin) return
      if (!evt.data || typeof evt.data.cmd !== "string") return

      this.handleNativeMessage(evt.data.cmd, evt.data)
    },
    probeWebExtension() {
      if (!this.isWebExtensionDashboardOrigin(window.location.origin)) return
      window.postMessage({
        channel: "tabspace-webextension-v2",
        source: "dashboard",
        type: "probe"
      }, window.location.origin)
    },
    handleWebExtensionMessage(evt) {
      if (evt.source !== window || evt.origin !== window.location.origin
        || !this.isWebExtensionDashboardOrigin(evt.origin)) return false
      const data = evt.data
      if (!data || data.channel !== "tabspace-webextension-v2" || data.source !== "extension") return false
      switch (data.type) {
        case "ready":
          this.setupWebExtensionBridge()
          break
        case "connected":
          this.setupWebExtensionBridge()
          this.markNativeDetected()
          this.requestInitialData(this.bridge)
          break
        case "native-message":
          if (data.message && data.message.cmd) {
            this.handleNativeMessage(data.message.cmd, data.message)
          }
          break
        case "connection-error":
        case "request-error":
          // The local helper refuses a save over the Free session limit; treat
          // it exactly like the Safari bridge's SessionLimitReached message.
          if (data.error && data.error.code === "session_limit_reached") {
            this.handleNativeMessage("SessionLimitReached", data)
            break
          }
          if (!this.$store.state.nativeDetected) {
            this.$store.commit("setConnectionTimedOut", true)
          }
          break
      }
      return true
    },
    isWebExtensionDashboardOrigin(origin) {
      if (typeof origin !== "string" || origin.length === 0) return false
      if (WEB_EXTENSION_ORIGINS.indexOf(origin) !== -1) return true
      if (origin.indexOf("https://") !== 0) return false
      return WEB_EXTENSION_ORIGIN_SUFFIXES.some(suffix =>
        origin === `https://${suffix}` || origin.endsWith(`.${suffix}`))
    },
    setupWebExtensionBridge() {
      if (this.directMode || this.webExtensionMode) return
      this.webExtensionMode = true
      this.bridgeModeResolved = true
      const webExtensionBridge = {
        send: msg => {
          this.webExtensionRequestId += 1
          window.postMessage({
            channel: "tabspace-webextension-v2",
            source: "dashboard",
            type: "request",
            requestId: `dashboard-${this.webExtensionRequestId}`,
            message: msg
          }, window.location.origin)
        },
        mode: "webextension"
      }
      this.$store.commit("setBridge", webExtensionBridge)
      this.bridgeReady = true
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
        // --- AI (protocol v2) replies ---
        case "ReturnEnhancedSession":
          this.handleEnhancedSession(data)
          break
        case "ReturnSplitPreview":
          this.handleSplitPreview(data)
          break
        case "ReturnSuggestions":
          this.handleSuggestions(data)
          break
        case "ReturnSubscriptionStatus":
          this.handleSubscriptionStatus(data)
          break
        case "PurchaseResult":
          // The native side redirected the user to the host app to complete the
          // purchase; there is no in-extension StoreKit sheet anymore.
          if (data.redirected) this.$store.commit("setPurchaseRedirecting", true)
          break
        case "SessionLimitReached":
          // Nothing was stored, so drop the local cards before offering the
          // upgrade — otherwise the refused session stays on screen.
          this.$store.commit("discardUnsavedSessions")
          this.$store.commit("setShowSubscriptionModal", true)
          break
      }
    },
    handleDefault(data) {
      if (data.id === this.protocolVersionKey) {
        const version = Number(data.value || 0)
        if (version > 0 && version < this.minimumProtocolVersion) {
          window.alert("This Tab Space app version is too old for the online dashboard. Please update Tab Space.")
        }
        // Record the negotiated protocol version; all AI UI is gated on it
        // (>= Constants.aiMinProtocolVersion) so older extensions simply hide it.
        this.$store.commit("setNativeProtocolVersion", version)
        this.initAI()
        return
      }
      this.$store.commit("setTabSpaceSetting", {key: data.id, value: data.value})
    },
    // Kick off AI-only requests once we know the extension speaks protocol v2.
    // Idempotent: guarded so it runs a single time per bridge session.
    initAI() {
      if (this.aiInitialized) return
      if (this.$store.state.nativeProtocolVersion < Constants.aiMinProtocolVersion) return
      if (!this.bridge) return
      this.aiInitialized = true
      this.prepareAI()
      this.bridge.send({cmd: "CheckDefault", name: Constants.suggestedTagsKey})
      this.bridge.send({cmd: "CheckSubscriptionStatus"})
      this.refreshSuggestions()
    },
    prepareAI() {
      if (!this.$store.getters.aiEnabled) return
      this.bridge.send({cmd: "PrepareAI"})
    },
    refreshSuggestions() {
      if (!this.bridge) return
      if (this.$store.state.nativeProtocolVersion < Constants.aiMinProtocolVersion) return
      this.bridge.send({cmd: "GetSuggestions"})
    },
    // --- AI reply handlers ---
    applyQuota(data) {
      if (data.quotaRemaining === undefined && data.quotaResetAt === undefined) return
      this.$store.commit("setAIQuota", {
        remaining: data.quotaRemaining,
        resetAt: data.quotaResetAt
      })
    },
    // Typed errors replace the demo's "empty result = failure" convention.
    handleAIError(data) {
      this.applyQuota(data)
      if (data.error === "quota_exceeded") {
        // A local StoreKit test purchase can make the native client premium
        // while the remote AI service still sees a free entitlement because
        // Xcode's locally signed transaction is not an Apple sandbox receipt.
        // Never show an upgrade prompt to someone the native side already
        // reports as premium; surface a retryable request error instead.
        if (this.$store.getters.isPremium) {
          this.$store.commit("setAIToast", {
            messageKey: "aiErrorGeneric",
            retry: this.retryPayloadFor(data)
          })
          return
        }
        // Genuine free-tier exhaustion: pin remaining to 0 and show upgrade.
        if (data.quotaRemaining === undefined) this.$store.commit("setAIQuota", {remaining: 0})
        this.$store.commit("setShowSubscriptionModal", true)
        return
      }
      if (data.error === "unauthorized") {
        this.$store.commit("setAIToast", {messageKey: "aiErrorUnauthorized", retry: null})
        return
      }
      // network / server / invalid_response / anything else: non-blocking,
      // retryable toast.
      const messageKey = data.error === "network" ? "aiErrorNetwork" : "aiErrorGeneric"
      const retry = this.retryPayloadFor(data)
      this.$store.commit("setAIToast", {messageKey, retry})
    },
    // Rebuild the request that failed so the toast's Retry button can re-send it.
    retryPayloadFor(data) {
      const session = data.uuid ? this.sessions.find(s => s.uuid === data.uuid) : null
      const originalSession = data.originalUuid ? this.sessions.find(s => s.uuid === data.originalUuid) : null
      if (session) return {cmd: "EnhanceSession", uuid: session.uuid, bookmarks: [session]}
      if (originalSession) return {cmd: "ClusterTabs", uuid: originalSession.uuid, bookmarks: [originalSession]}
      return null
    },
    handleEnhancedSession(data) {
      this.$store.commit("setEnhancingSessionId", "")
      if (data.error) {
        this.handleAIError(data)
        return
      }
      this.applyQuota(data)
      const session = this.sessions.find(s => s.uuid === data.uuid)
      if (!session) return
      if (data.title) session.title = data.title
      if (data.tags) {
        try {
          const newTags = JSON.parse(data.tags)
          const existingNames = session.tags.map(t => t.name)
          newTags.forEach(tag => {
            if (tag && tag.name && !existingNames.includes(tag.name)) session.tags.push(tag)
          })
        } catch (e) {
          console.error("Failed to parse AI tags:", e)
        }
      }
      // Persist and trigger the golden flash / typewriter on the card.
      this.bridge.send({cmd: "UpdateSession", bookmarks: [session]})
      this.$store.commit("setEnhancedFlash", {uuid: session.uuid, title: data.title || session.title})
      this.refreshSuggestions()
    },
    handleSplitPreview(data) {
      if (data.originalUuid) this.$store.commit("setSplittingSessionId", "")
      if (data.error) {
        this.handleAIError(data)
        return
      }
      this.applyQuota(data)
      try {
        const clusters = JSON.parse(data.clusters || "[]")
        if (clusters.length > 1) {
          this.$store.commit("setSplitPreview", {
            clusters,
            totalTabs: data.totalTabs || 0,
            originalUuid: data.originalUuid || null
          })
        } else {
          // Nothing to split into — tell the user rather than opening an empty modal.
          this.$store.commit("setAIToast", {messageKey: "splitNoTopics", retry: null})
          this.$store.commit("setSplitPreview", null)
        }
      } catch (e) {
        console.error("Failed to parse split preview:", e)
        this.$store.commit("setAIToast", {messageKey: "aiErrorGeneric", retry: null})
      }
    },
    handleSuggestions(data) {
      try {
        this.$store.commit("setSuggestions", JSON.parse(data.suggestions || "[]"))
      } catch (e) {
        console.error("Failed to parse suggestions:", e)
        this.$store.commit("setSuggestions", [])
      }
    },
    handleSubscriptionStatus(data) {
      this.$store.commit("setEntitlementStatus", {
        status: data.status,
        tier: data.tier,
        plusDisplayPrice: data.plusDisplayPrice
      })
      this.applyQuota(data)
      // RestorePurchases / PurchaseSubscription both hand off to the host app.
      // Reflect that in the UI, and stop showing "continuing…" once the status
      // actually came back as subscribed.
      if (data.redirected) this.$store.commit("setPurchaseRedirecting", true)
      if (this.$store.getters.isPremium) this.$store.commit("setPurchaseRedirecting", false)
    },
    // Re-ask the native side for subscription + quota. Used by Settings on
    // mount and whenever the tab regains focus after a host-app redirect, so
    // status cannot go stale after the user subscribes outside the dashboard.
    refreshSubscriptionStatus() {
      if (!this.bridge) return
      if (this.$store.state.nativeProtocolVersion < Constants.aiMinProtocolVersion) return
      this.bridge.send({cmd: "CheckSubscriptionStatus"})
    },
    handleVisibilityChange() {
      if (document.visibilityState !== "visible") return
      // Only worth a round trip when a purchase/restore redirect is pending.
      if (!this.$store.state.purchaseRedirecting) return
      this.refreshSubscriptionStatus()
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
      if (bridge && bridge.mode === "webextension") {
        bridge.send({cmd: "CheckBookmarks"})
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
          // Keep the local suggestion queue in step with the library once AI is on.
          this.refreshSuggestions()
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
