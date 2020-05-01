import Vue from 'vue'
import Vuex from 'vuex'
import _ from 'lodash'
import LangData from './lang'
import Constants from './constants'

Vue.use(Vuex);

const defaultTabSpaceSettings = {
    [Constants.preferredLanguageKey]: navigator.language.toLowerCase()
}
function setLang(languageCode) {
    // fallback to en-us for lang.json
    let lang = LangData[languageCode || defaultTabSpaceSettings[Constants.preferredLanguageKey]] || LangData["en-us"];
    for (let key in LangData["en-us"]) lang[key] = lang[key] || LangData["en-us"][key];
    return lang;
}

const store = new Vuex.Store({
    // strict: true,
    state: {
        lang: setLang(),
        bridge: null,
        initialRefresh: false,
        sessions: [],
        keyword: "",
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
                session.tags.forEach(tag => tags.add(tag.name))
            })
            return Array.from(tags).sort()
        },
        displaySessions: state => {
            let displaySessions = state.sessions;
            if (state.activeTag)
                displaySessions = displaySessions.filter(session => session.tags.length > 0 
                    && session.tags.map(tag => tag.name).includes(state.activeTag))
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
        setSessions(state, newSessions) {
            state.sessions = newSessions
            state.initialRefresh = true
        },
        setKeyword(state, newKeyword) {
            state.keyword = newKeyword
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
