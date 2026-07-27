import Vue from 'vue'
import Vuex from 'vuex'
import LangData from './locales'
import Constants from './constants'
import { sessionMatchesQuery } from './search'

Vue.use(Vuex);

const defaultTabSpaceSettings = {
    [Constants.preferredLanguageKey]: navigator.language.toLowerCase()
}
const sessionViewModeStorageKey = "tabspace-session-cards-view-mode"
const legacySessionCollapseStorageKey = "tabspace-session-cards-collapsed"
const sessionViewModes = ["expanded", "titles", "compact"]

function getInitialSessionViewMode() {
    try {
        const storedMode = localStorage.getItem(sessionViewModeStorageKey)
        if (sessionViewModes.includes(storedMode)) return storedMode
        return localStorage.getItem(legacySessionCollapseStorageKey) === "true" ? "compact" : "expanded"
    } catch {
        return "expanded"
    }
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
        // --- AI (protocol v2) ---
        // Native bridge protocol version (0 until reported). AI UI is gated on
        // this being >= Constants.aiMinProtocolVersion so the dashboard stays
        // clean against older extensions.
        nativeProtocolVersion: 0,
        enhancingSessionId: "",
        splittingSessionId: "",
        splitPreview: null,          // { clusters, totalTabs, originalUuid }
        // Golden "just enhanced" flash + typewriter, keyed by session uuid.
        enhancedFlash: null,         // { uuid, title }
        // Local, ranked suggestion queue from GetSuggestions (top item first).
        suggestions: [],
        showSuggestionReport: false,
        // Server-authoritative subscription + quota (never client-decided).
        subscriptionStatus: "free",  // "free" | "active"
        aiQuotaRemaining: null,      // Int, -1 = unlimited, null = unknown
        aiQuotaResetAt: null,        // epoch seconds
        showSubscriptionModal: false,
        purchaseRedirecting: false,  // set once the native side confirms a redirect
        // Transient, non-blocking AI error toast: { message, retry } | null.
        aiToast: null,
        tabSpaceSettings: {
            ...defaultTabSpaceSettings
        }
    },
    getters: {
        // Single source of truth for whether the AI UI may appear at all.
        // AI needs BOTH protocol v2 and an active direct bridge.
        aiEnabled: state => state.nativeProtocolVersion >= Constants.aiMinProtocolVersion
            && !!state.bridge && state.bridge.mode === "direct",
        isPremium: state => state.subscriptionStatus === "active",
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
        setSubscriptionStatus(state, status) {
            state.subscriptionStatus = status === "active" ? "active" : "free"
        },
        setAIQuota(state, { remaining, resetAt }) {
            if (remaining !== undefined && remaining !== null) state.aiQuotaRemaining = Number(remaining)
            if (resetAt !== undefined && resetAt !== null) state.aiQuotaResetAt = Number(resetAt)
        },
        setShowSubscriptionModal(state, show) {
            state.showSubscriptionModal = show
            if (!show) state.purchaseRedirecting = false
        },
        setPurchaseRedirecting(state, redirecting) {
            state.purchaseRedirecting = redirecting
        },
        setAIToast(state, toast) {
            state.aiToast = toast
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
