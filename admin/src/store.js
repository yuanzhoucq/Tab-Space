import Vue from 'vue'
import Vuex from 'vuex'
import LangData from './lang'
import Constants from './constants'

Vue.use(Vuex);

const defaultTabSpaceSettings =  {
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
        tabSpaceSettings: {
            ...defaultTabSpaceSettings
        }
    },
    getters: {
        tags: state => {
            let tags = []
            state.sessions.forEach(session => {
                session.tags.forEach(tag => !tags.includes(tag.name) && tags.push(tag.name))
            })
            return tags
        },
        displaySessions: state => {
            let displaySessions = state.sessions;
            if (state.activeTag)
                displaySessions = displaySessions.filter(session => session.tags.length > 0 
                    && session.tags.map(tag => tag.name).includes(state.activeTag))
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
            state.sessions = newSessions
            state.initialRefresh = true
        },
        setKeyword(state, newKeyword) {
            state.keyword = newKeyword
        },
        setActiveTag(state, newTag) {
            state.activeTag = newTag
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
