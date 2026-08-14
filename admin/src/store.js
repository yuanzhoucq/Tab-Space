import Vue from 'vue'
import Vuex from 'vuex'
import LangData from './locales'
import Constants from './constants'
import { isHandheld } from './device'
import { sessionMatchesQuery } from './search'

Vue.use(Vuex);

const defaultTabSpaceSettings = {
    [Constants.preferredLanguageKey]: navigator.language.toLowerCase()
}
const sessionViewModeStorageKey = "tabspace-session-cards-view-mode"
const legacySessionCollapseStorageKey = "tabspace-session-cards-collapsed"
const sessionViewModes = ["expanded", "titles", "compact"]
const largeLibraryTabThreshold = 1000

function getInitialSessionViewMode() {
    try {
        const storedMode = localStorage.getItem(sessionViewModeStorageKey)
        if (sessionViewModes.includes(storedMode)) return storedMode
        const legacyMode = localStorage.getItem(legacySessionCollapseStorageKey)
        if (legacyMode !== null) {
            return legacyMode === "true" ? "compact" : "expanded"
        }
    } catch {
        // Browser storage is optional; the in-memory default still works.
    }
    return "expanded"
}

function isLargeLibrary(sessions) {
    let tabCount = 0
    for (const session of sessions || []) {
        tabCount += Array.isArray(session.sites) ? session.sites.length : 0
        if (tabCount >= largeLibraryTabThreshold) return true
    }
    return false
}

function persistSessionViewMode(mode) {
    try {
        localStorage.setItem(sessionViewModeStorageKey, mode)
        // Keep older dashboard builds on a safe equivalent of the first two modes.
        localStorage.setItem(legacySessionCollapseStorageKey, String(mode === "compact"))
    } catch {
        // Keep the in-memory state usable when browser storage is unavailable.
    }
}

// A card that only exists in the dashboard: it keeps its placeholder uuid
// until the native side accepts it and echoes back a stored session.
export function isUnsavedSession(session) {
    return typeof session.uuid === "string" && session.uuid.startsWith(Constants.newSessionUuidPrefix)
}

function setLang(languageCode) {
    const requestedLanguage = (languageCode || defaultTabSpaceSettings[Constants.preferredLanguageKey]).toLowerCase()
    const baseLanguage = requestedLanguage.split("-")[0]
    const translation = LangData[requestedLanguage] || LangData[baseLanguage] || {}
    return { ...LangData["en-us"], ...translation }
}

const store = new Vuex.Store({
    // strict: true,
    state: {
        lang: setLang(),
        bridge: null,
        nativeDetected: false,
        connectionTimedOut: false,
        initialRefresh: false,
        sessions: [],
        keyword: "",
        sessionViewMode: getInitialSessionViewMode(),
        activeTag: "",
        editingSessionUuid: "",
        // Bumped to re-open the iOS banner after it was dismissed. The banner
        // carries the install QR code, and on a Mac that code is the only
        // working way to reach the iOS app — the App Store listing reports the
        // iPhone app as incompatible and cannot sell it. So the navbar entry
        // brings the banner back instead of opening that dead end.
        iosBannerRequestCount: 0,
        // --- AI (protocol v2) ---
        // Native bridge protocol version (0 until reported). AI UI is gated on
        // this being >= Constants.aiMinProtocolVersion so the dashboard stays
        // clean against older extensions.
        nativeProtocolVersion: 0,
        // `null` means the bridge does not negotiate named capabilities
        // (Safari direct/legacy bridges). WebExtensions provide an explicit
        // list so older local helpers can keep unsupported AI hidden.
        nativeCapabilities: null,
        // Safari's direct bridge reports whether the current app build's menu
        // bar helper is alive. `unknown` keeps older native builds quiet.
        switcherHelperStatus: "unknown", // "unknown" | "ready" | "needsAppLaunch"
        enhancingSessionId: "",
        splittingSessionId: "",
        splitPreview: null,          // { clusters, totalTabs, originalUuid }
        // Golden "just enhanced" flash + typewriter, keyed by session uuid.
        enhancedFlash: null,         // { uuid, title }
        // Local, ranked suggestion queue from GetSuggestions (top item first).
        suggestions: [],
        showSuggestionReport: false,
        // Native entitlement tier. Protocol v2 reports Free / Plus / Pro;
        // older native builds are mapped from their legacy active/free status.
        entitlementTier: "free",    // "free" | "plus" | "pro"
        subscriptionStatus: "free",  // "free" | "active"
        // False until the native side reports a tier. Native builds that never
        // report one predate the Free limit, so the dashboard must not apply it.
        entitlementResolved: false,
        // The permanent Plus grant itself, which Pro hides: a subscriber who
        // bought the Mac app before 4.0 still owns Plus underneath, and the
        // native side reports the two facts separately.
        permanentPlusOwned: false,
        plusDisplayPrice: null,      // localized StoreKit price, optional in protocol v2
        freeSessionLimit: Constants.freeSessionLimit,
        enforcesSessionLimit: false,
        aiQuotaRemaining: null,      // Int, -1 = unlimited, null = unknown
        aiQuotaResetAt: null,        // epoch seconds
        showSubscriptionModal: false,
        subscriptionModalReason: null,
        purchaseRedirecting: false,  // set once the native side confirms a redirect
        // Stays true from the redirect until the native side reports a higher
        // tier. Closing the dialog clears purchaseRedirecting, but the purchase
        // itself is still in flight in the host app, so the status refresh on
        // return must not depend on the dialog being open.
        purchaseAwaitingActivation: false,
        // Last resort after the status refresh kept reporting the old tier:
        // asks the user to reload instead of leaving AI silently unusable.
        showSubscriptionRefreshPrompt: false,
        // Transient, non-blocking AI error toast: { message, retry } | null.
        aiToast: null,
        // AI data-flow disclosure. The native side refuses every AI request with
        // "consent_required" until the user accepts, so this modal is the only
        // way any title or URL ever reaches the AI service.
        showAIConsentModal: false,
        // Request to re-send once consent is granted: a bridge payload | null.
        aiConsentPendingRetry: null,
        // Set when the release introduction is reopened from Settings, which
        // ignores the once-per-release rule the automatic showing follows.
        whatsNewRequested: false,
        tabSpaceSettings: {
            ...defaultTabSpaceSettings
        }
    },
    getters: {
        // Single source of truth for whether the AI UI may appear at all.
        // Safari protocol v2 has AI built in. Companion WebExtensions also
        // require the local helper's explicit AI capability.
        aiEnabled: state => state.nativeProtocolVersion >= Constants.aiMinProtocolVersion
            && !!state.bridge
            && (state.bridge.mode === "direct"
                || (state.bridge.mode === "webextension"
                    && Array.isArray(state.nativeCapabilities)
                    && state.nativeCapabilities.includes("ai.v1")
                    && state.nativeCapabilities.includes("dashboard.ai.v1"))),
        // Whether the tab switcher is worth mentioning to this reader. It is a
        // macOS-only surface of the desktop app, so a phone or iPad never
        // qualifies. A companion browser reaches it through the local helper
        // and says so with a capability; Safari's direct bridge advertises
        // none, so its dedicated helper-status reply is the proof instead.
        switcherAvailable: state => !!state.bridge
            && !isHandheld()
            && ((state.bridge.mode === "direct" && state.switcherHelperStatus === "ready")
                || (Array.isArray(state.nativeCapabilities)
                    && state.nativeCapabilities.includes(Constants.switcherCapability))),
        switcherNeedsAppLaunch: state => !!state.bridge
            && !isHandheld()
            && state.bridge.mode === "direct"
            && state.switcherHelperStatus === "needsAppLaunch",
        switcherHintAvailable: (state, getters) => Constants.switcherHintEnabled
            && (getters.switcherAvailable || getters.switcherNeedsAppLaunch),
        isPremium: state => state.entitlementTier === "pro",
        hasPermanentPlus: state => state.entitlementTier === "plus",
        // Whether the permanent Plus grant was ever made, regardless of whether
        // a Pro subscription now sits on top of it.
        ownsPermanentPlus: state => state.permanentPlusOwned,
        // The native side counts every stored session, including the ones in
        // Trash, so this count must not filter by tag.
        savedSessionCount: state => state.sessions.filter(session => !isUnsavedSession(session)).length,
        // Free stops at the limit reported by the current native build. The
        // native side remains authoritative; this only avoids an editor that
        // cannot be stored.
        canCreateSession: (state, getters) => !state.entitlementResolved
            || !state.enforcesSessionLimit
            || state.entitlementTier !== "free"
            || getters.savedSessionCount < state.freeSessionLimit,
        largeLibrary: state => isLargeLibrary(state.sessions),
        topSuggestion: state => state.suggestions[0] || null,
        tags: state => {
            let tags = new Set()
            state.sessions.forEach(session => {
                if (session.tags.map(t => t.name).includes("@Trash")) {
                    // Tags of session in @Trash should not display
                    tags.add("@Trash")
                } else {
                    session.tags.forEach(tag => tags.add(tag.name))
                }
                
            })
            return Array.from(tags).sort()
        },
        displaySessions: state => {
            let displaySessions = state.sessions;
            if (state.activeTag)
                if (state.activeTag === 'untagged') {
                    displaySessions = state.sessions.filter(session => session.tags.length === 0)
                } else {
                    displaySessions = displaySessions.filter(session => session.tags.length > 0 
                        && session.tags.map(tag => tag.name).includes(state.activeTag))
                }
            if (state.activeTag !== '@Trash')
                displaySessions = displaySessions.filter(session =>  
                    !session.tags.map(tag => tag.name).includes('@Trash'))
            if (state.keyword && state.keyword.trim()) {
                displaySessions = displaySessions.filter(session => sessionMatchesQuery(session, state.keyword))
            }
            return displaySessions
        }
    },
    mutations: {
        updateLang(state, {key, value}) {
            state.lang[key] = value
        },
        setBridge(state, bridge) {
            state.bridge = bridge
        },
        requestIosBanner(state) {
            state.iosBannerRequestCount += 1
        },
        setNativeDetected(state, detected) {
            state.nativeDetected = detected
        },
        setConnectionTimedOut(state, timedOut) {
            state.connectionTimedOut = timedOut
        },
        setSessions(state, newSessions) {
            state.sessions = newSessions
            state.initialRefresh = true
        },
        spliceSessions(state, payload) {
            const {start, deleteCount, items} = payload
            state.sessions.splice(start, deleteCount, ...items)
        },
        // The native side refused to store new sessions, so the cards that only
        // ever existed in the dashboard have to go: leaving them behind makes a
        // rejected save look successful until the next refresh.
        discardUnsavedSessions(state) {
            state.sessions = state.sessions.filter(session => !isUnsavedSession(session))
            state.editingSessionUuid = ""
        },
        setKeyword(state, newKeyword) {
            state.keyword = newKeyword
        },
        toggleCollapse(state) {
            const currentIndex = sessionViewModes.indexOf(state.sessionViewMode)
            state.sessionViewMode = sessionViewModes[(currentIndex + 1) % sessionViewModes.length]
            persistSessionViewMode(state.sessionViewMode)
        },
        setSessionViewMode(state, mode) {
            if (!sessionViewModes.includes(mode)) return
            state.sessionViewMode = mode
            persistSessionViewMode(mode)
        },
        setActiveTag(state, newTag) {
            state.activeTag = newTag
        },
        setEditingSessionUuid(state, newId) {
            state.editingSessionUuid = newId
        },
        // --- AI mutations ---
        setNativeProtocolVersion(state, version) {
            state.nativeProtocolVersion = Number(version) || 0
        },
        setNativeCapabilities(state, capabilities) {
            state.nativeCapabilities = Array.isArray(capabilities) ? capabilities : null
        },
        setSwitcherHelperStatus(state, status) {
            state.switcherHelperStatus = ["ready", "needsAppLaunch"].includes(status)
                ? status
                : "unknown"
        },
        setEnhancingSessionId(state, newId) {
            state.enhancingSessionId = newId
        },
        setSplittingSessionId(state, newId) {
            state.splittingSessionId = newId
        },
        setSplitPreview(state, preview) {
            state.splitPreview = preview
        },
        setEnhancedFlash(state, flash) {
            state.enhancedFlash = flash
        },
        setSuggestions(state, suggestions) {
            state.suggestions = Array.isArray(suggestions) ? suggestions : []
        },
        setShowSuggestionReport(state, show) {
            state.showSuggestionReport = show
        },
        setEntitlementStatus(state, {
            status,
            tier,
            hasPermanentPlus,
            plusDisplayPrice,
            freeSessionLimit,
            enforcesSessionLimit
        }) {
            const normalizedStatus = status === "active" ? "active" : "free"
            const normalizedTier = ["free", "plus", "pro"].includes(tier)
                ? tier
                // Compatibility with native replies that predate the explicit
                // Free / Plus / Pro tier field.
                : (normalizedStatus === "active" ? "pro" : "free")
            state.subscriptionStatus = normalizedStatus
            state.entitlementTier = normalizedTier
            state.entitlementResolved = true
            // Native builds that predate the separate flag only express the
            // grant through the Plus tier.
            state.permanentPlusOwned = hasPermanentPlus === undefined
                ? normalizedTier === "plus"
                : Boolean(hasPermanentPlus)
            if (typeof plusDisplayPrice === "string" && plusDisplayPrice.trim()) {
                state.plusDisplayPrice = plusDisplayPrice.trim()
            }
            const reportedLimit = Number(freeSessionLimit)
            if (Number.isInteger(reportedLimit) && reportedLimit > 0) {
                state.freeSessionLimit = reportedLimit
            }
            if (typeof enforcesSessionLimit === "boolean") {
                state.enforcesSessionLimit = enforcesSessionLimit
            }
        },
        setAIQuota(state, { remaining, resetAt }) {
            if (remaining !== undefined && remaining !== null) state.aiQuotaRemaining = Number(remaining)
            if (resetAt !== undefined && resetAt !== null) state.aiQuotaResetAt = Number(resetAt)
        },
        clearAIQuota(state) {
            state.aiQuotaRemaining = null
            state.aiQuotaResetAt = null
        },
        setFreeSessionLimit(state, limit) {
            const normalized = Number(limit)
            if (Number.isInteger(normalized) && normalized > 0) {
                state.freeSessionLimit = normalized
            }
        },
        setShowSubscriptionModal(state, payload) {
            const structured = payload && typeof payload === "object"
            const show = structured ? Boolean(payload.show) : Boolean(payload)
            state.showSubscriptionModal = show
            state.subscriptionModalReason = show && structured ? (payload.reason || null) : null
            if (!show) state.purchaseRedirecting = false
        },
        setPurchaseRedirecting(state, redirecting) {
            state.purchaseRedirecting = redirecting
        },
        setPurchaseAwaitingActivation(state, awaiting) {
            state.purchaseAwaitingActivation = awaiting
            if (!awaiting) state.showSubscriptionRefreshPrompt = false
        },
        setShowSubscriptionRefreshPrompt(state, show) {
            state.showSubscriptionRefreshPrompt = show
        },
        setAIToast(state, toast) {
            state.aiToast = toast
        },
        setWhatsNewRequested(state, requested) {
            state.whatsNewRequested = requested
        },
        setAIConsentPrompt(state, { show, retry = null }) {
            state.showAIConsentModal = show
            state.aiConsentPendingRetry = show ? retry : null
        },
        setTabSpaceSetting(state, {key, value}) {
            let settings = { ...state.tabSpaceSettings }
            settings[key] = value
            if (key === Constants.preferredLanguageKey && Constants.languages.map(i=>i.code).includes(value)) {
                state.lang = setLang(value)
            }
            state.tabSpaceSettings = settings
        }
    }
})

export default store;
