<template>
  <div>
    <div id="main">
      <navbar v-if="nativeDetected && initialRefresh"></navbar>
      <div id="title" :class="{'title-centered': !nativeDetected || !initialRefresh}">
        <h1>Tab Space</h1>
        <input v-if="nativeDetected && initialRefresh"
               type="text" name="keyword" id="keyword" v-model="keyword"
               :placeholder="lang.searchPlaceholder">
      </div>
      <div v-if="showLoadingState" class="connection-state">
        <vue-loading type="bars" color="#eb5205" :size="{ width: '50px', height: '50px' }"></vue-loading>
        <p class="connection-title">{{nativeDetected ? lang.loadingSessions : lang.connectingApp}}</p>
        <p v-if="connectionTimedOut" class="connection-detail">{{lang.connectionSlow}}</p>
        <div v-if="connectionTimedOut" class="connection-actions">
          <button class="secondary-button" type="button" @click="reload">{{lang.retry}}</button>
          <button v-if="canOpenBundledDashboard"
                  class="secondary-button"
                  type="button"
                  @click="openBundledDashboard">
            {{lang.openBundledDashboard}}
          </button>
        </div>
      </div>
      <div v-else-if="!nativeDetected" class="connection-state prospect-state">
        <h2>{{lang.appNotDetected}}</h2>
        <p class="connection-detail">{{lang.appNotDetectedTip}}</p>
        <p class="connection-permission-hint" data-testid="extension-permission-hint">
          {{lang.extensionPermissionHint}}
        </p>
        <div class="connection-actions">
          <a class="primary-button"
             href="https://mytab.space"
             target="_blank"
             rel="noopener noreferrer">{{lang.getTabSpace}}</a>
          <button class="secondary-button" type="button" @click="reload">{{lang.retry}}</button>
        </div>
      </div>
      <div class="empty-state" v-if="nativeDetected && initialRefresh && sessions.length < 1">
        <p>{{lang.noSessions}}</p>
      </div>
      <suggestion-card v-if="nativeDetected && initialRefresh"></suggestion-card>
      <div v-if="nativeDetected && initialRefresh" class="sessions-container">
        <session-sidebar></session-sidebar>
        <div class="session-column">
          <ios-banner></ios-banner>
          <sessions></sessions>
        </div>
        <session-hub></session-hub>
      </div>
    </div>
    <footer>
      <a class="link" href="mailto:support@mytab.space">{{lang.contact}}</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://twitter.com/joyuer/status/1164816334305157120" target="_blank">Twitter</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://mytab.space" target="_blank">{{lang.about}}</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://mytab.space/#faq" target="_blank" rel="noopener">FAQ</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://mytab.space/privacy.html" target="_blank" rel="noopener">{{lang.privacy}}</a>
    </footer>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { VueLoading } from 'vue-loading-template'
  import { mapState } from 'vuex'

  import IosBanner from '../components/IosBanner'
  import Navbar from '../components/Navbar'
  import SessionSidebar from '../components/SessionSidebar'
  import SessionHub from '../components/SessionHub'
  import Sessions from '../components/Sessions'
  import SuggestionCard from '../components/SuggestionCard'

  export default {
    components: {
      VueLoading,
      IosBanner,
      Navbar,
      SessionSidebar,
      SessionHub,
      Sessions,
      SuggestionCard,
    },
    data() {
      return {
        keyword: ""
      }
    },
    computed: {
      ...mapState([
        "lang",
        "bridge",
        "nativeDetected",
        "connectionTimedOut",
        "sessions",
        "initialRefresh"
      ]),
      showLoadingState() {
        return (!this.nativeDetected && !this.connectionTimedOut)
          || (this.nativeDetected && !this.initialRefresh)
      },
      canOpenBundledDashboard() {
        return Boolean(this.bridge && typeof this.bridge.fallbackToBundled === "function")
      }
    },
    created() {
      this.debouncedSetKeyword = _.debounce(value => this.$store.commit('setKeyword', value), 300)
    },
    watch: {
      keyword(value) {
        this.debouncedSetKeyword(value)
      }
    },
    methods: {
      reload() {
        window.location.reload()
      },
      openBundledDashboard() {
        if (this.canOpenBundledDashboard) {
          this.bridge.fallbackToBundled()
        }
      }
    }
  }
</script>

<style>
  body {
    background-image: radial-gradient(1200px 500px at 70% -10%, rgba(250, 128, 114, 0.1), transparent 70%),
      linear-gradient(-45deg, #efece6, #f8f6f2);
    background-attachment: fixed;
    background-repeat: no-repeat;
    font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;
  }

  li {
    list-style: none;
    padding: 2px 8px 2px 8px;
    margin-right: 8px;
    margin-left: 8px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: background-color 0.15s ease;
    position: relative;
  }

  li:hover {
    background-color: rgba(0, 0, 0, 0.06);
  }

  li:hover .del-item {
    display: flex;
    position: absolute;
    left: -24px;
    top: 0;
    bottom: 0;
    align-items: center;
  }

  #main {
    --dashboard-side-padding: 16px;
    --dashboard-sidebar-column: 130px;
    --dashboard-hub-column: 45px;
    min-height: calc(100vh - 35px);
  }

  footer {
    display: flex;
    justify-content: center;
    font-size: 14px;
  }

  .link {
    color: rgb(54, 49, 61);
    font-weight: normal;
    cursor: pointer;
    text-decoration: none;
    padding: 2px 4px;
    border-radius: 4px;
    transition: background-color 0.15s ease;
  }

  li .link {
    font-size: 14px;
    font-weight: 500;
  }

  #title {
    min-height: 80px;
    width: 100%;
    max-width: 840px;
    margin: 10px auto 0;
    padding: 0 var(--dashboard-side-padding);
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    column-gap: 12px;
  }

  #title h1 {
    display: inline-block;
    margin: 10px 0;
  }

  #title:not(.title-centered) h1 {
    margin-left: var(--dashboard-sidebar-column);
    transform: translateY(-12px);
  }

  #title.title-centered {
    justify-content: center;
  }

  .footer-sep {
    width: 10px;
  }

  .sessions-container {
    display: flex;
    transition: 0.2s;
    flex-direction: row;
    justify-content: left;
    width: 100%;
    max-width: 840px;
    margin: 0 auto;
    padding: 0 var(--dashboard-side-padding);
    box-sizing: border-box;
  }

  .session-column {
    flex: 1;
    min-width: 0;
  }

  .session-column .ios-banner {
    margin-bottom: 12px;
  }

  @media (max-width: 700px) {
    .sessions-container {
      flex-wrap: wrap;
    }

    .sessions-container .session-column {
      order: 3;
      flex-basis: 100%;
    }

    .sessions-container .session-hub {
      order: 2;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 4px;
      margin: 0 0 10px;
    }
  }

  .session-move {
    transition: transform 0.5s;
  }

  .export:hover .export-dropdown,
  .export:focus-within .export-dropdown {
    display: block;
  }

  .import:hover .import-dropdown,
  .import:focus-within .import-dropdown {
    display: block;
  }


  .msg-prompt {
    color: red;
    font-weight: bold;
  }

  .msg {
    max-width: 900px;
    margin: 0 auto;
    color: #444444;
    background-color: #dddddd;
    padding: 3px 10px;
  }

  .connection-state {
    max-width: 560px;
    text-align: center;
    margin: 120px auto 0;
    color: #666666;
    padding: 0 24px;
  }

  .connection-title {
    margin-top: 14px;
  }

  .connection-detail {
    color: #777777;
    line-height: 1.5;
  }

  .connection-permission-hint {
    color: #555555;
    line-height: 1.5;
    margin: 14px auto 0;
    max-width: 520px;
  }

  .prospect-state h2 {
    color: #333333;
    font-size: 22px;
    margin-bottom: 10px;
  }

  .connection-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 20px;
  }

  .primary-button,
  .secondary-button {
    border: 0;
    border-radius: 5px;
    cursor: pointer;
    font: inherit;
    padding: 9px 16px;
    text-decoration: none;
  }

  .primary-button {
    background: #eb5205;
    color: #ffffff;
  }

  .secondary-button {
    background: #e2e2e2;
    color: #333333;
  }

  .empty-state {
    color: #666666;
    margin: 20px auto;
    text-align: center;
  }

  #keyword {
    margin: 10px 0;
    outline: none;
    border-radius: 4px;
    border-width: 0;
    height: 30px;
    font-size: 16px;
    color: #444444;
    width: 200px;
    max-width: 100%;
    padding-left: 10px;
    margin-left: auto;
    /* align right edge with the session cards (hub column = 15px gap + 30px button) */
    margin-right: var(--dashboard-hub-column);
  }

  @media (max-width: 700px) {
    #title:not(.title-centered) h1 {
      margin-left: 0;
      transform: none;
    }

    #keyword {
      margin-right: 0;
    }
  }

  .highlight {
    background-color: #fadd23;
  }

  @media (prefers-color-scheme: dark) {
    body {
      background-image: radial-gradient(1200px 500px at 70% -10%, rgba(250, 128, 114, 0.06), transparent 70%),
        linear-gradient(-45deg, #1c1c1e, #232325);
      color: #eeeeee;
    }

    input {
      background-color: #252525;
      color: #d0d0d0;
    }

    .link {
      color: #d0d0d0;
    }

    .link:hover {
      background-color: transparent;
    }

    li:hover {
      background-color: rgba(255, 255, 255, 0.08);
    }

    #keyword {
      color: #eeeeee;
    }

    .highlight {
      background-color: #fadd236e;
      color: #ffffff;
    }

    .prospect-state h2 {
      color: #eeeeee;
    }

    .connection-state,
    .connection-detail,
    .connection-permission-hint,
    .empty-state {
      color: #bdbdbd;
    }

    .secondary-button {
      background: #555555;
      color: #eeeeee;
    }
  }
</style>
