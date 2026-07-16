import Vue from 'vue'
import Vuex from 'vuex'
import _ from 'lodash'
import LangData from './locales'
import Constants from './constants'

Vue.use(Vuex);

const defaultTabSpaceSettings = {
    [Constants.preferredLanguageKey]: navigator.language.toLowerCase()
}
const sessionCollapseStorageKey = "tabspace-session-cards-collapsed"

function getInitialCollapseState() {
    try {
        return localStorage.getItem(sessionCollapseStorageKey) === "true"
    } catch {
        return false
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
        collapse: getInitialCollapseState(),
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
            if (state.keyword) {
                displaySessions = displaySessions.filter(session =>
                    _.chain(session)
                    .pick(["title", "sites", "tags", "comment"])
                    .values()
                    .flatten()
                    .map(o => _.isObject(o) ? _.values(o) : o)
                    .flatten()
                    .value()
                    .join("§")
                    .toLowerCase()
                    .includes(state.keyword.toLowerCase())
                )
                displaySessions = displaySessions.map(s => {
                    s.comment = state.keyword
                    return s
                })
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
            state.collapse = !state.collapse
            try {
                localStorage.setItem(sessionCollapseStorageKey, String(state.collapse))
            } catch {
                // Keep the in-memory state usable when browser storage is unavailable.
            }
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
