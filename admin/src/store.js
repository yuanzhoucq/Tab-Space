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
        tabSpaceSettings: {
            ...defaultTabSpaceSettings
        }
    },
    getters: {
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
