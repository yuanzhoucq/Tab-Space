import Vue from 'vue'
import Vuex from 'vuex'
import LangData from './lang'
import { validateSessionsArray } from './utility'

Vue.use(Vuex);
const store = new Vuex.Store({
    state: {
        lang: LangData[navigator.language.toLowerCase()] || LangData["en-us"],
        bridge: null,
        initialRefresh: false,
        sessions: [],
        keyword: "",
        activeTag: ""
    },
    getters: {
        tags: state => {
            let tags = []
            state.sessions.forEach(session => {
                session[3] && session[3].forEach(tag => !tags.includes(tag) && tags.push(tag))
            })
            return tags
        },
        displaySessions: state => {
            let displaySessions = state.sessions;
            if (state.activeTag)
                displaySessions = displaySessions.filter(session => session[3] && session[3].includes(state.activeTag))
            if (state.keyword)
                displaySessions = displaySessions.filter(session =>
                  JSON.stringify(session).toLowerCase().includes(state.keyword.toLowerCase()))
            return  displaySessions
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
            if (validateSessionsArray(newSessions)) {
                state.sessions = newSessions
                state.initialRefresh = true
            }
        },
        setKeyword(state, newKeyword) {
            state.keyword = newKeyword
        },
        setActiveTag(state, newTag) {
            state.activeTag = newTag
        }
    }
})

export default store;
