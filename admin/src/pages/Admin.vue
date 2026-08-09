<template>
  <div>
    <div id="main">
      <navbar v-if="nativeDetected && initialRefresh"></navbar>
      <div id="title" :class="{'title-centered': !nativeDetected || !initialRefresh, 'with-hint': switcherHintAvailable}">
        <h1>
          Tab Space
          <span v-if="isPremium"
                class="pro-badge"
                data-testid="pro-badge"
                :title="lang.planPremium"
                :aria-label="lang.planPremium">Pro</span>
        </h1>
        <div v-if="nativeDetected && initialRefresh" class="search-area">
          <div class="search-field" :class="{ 'with-hint': switcherHintAvailable }">
            <input type="text" name="keyword" id="keyword" v-model="keyword"
                   :placeholder="lang.searchPlaceholder">
            <switcher-hint></switcher-hint>
          </div>
        </div>
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
      <div class="empty-state" v-if="nativeDetected && initialRefresh && sessions.length < 1" data-testid="empty-state">
        <p>{{lang.noSessions}}</p>
        <p class="empty-state-tip">{{lang.noSessionsTip}}</p>
        <a class="link empty-state-link"
           href="https://mytab.space/#features"
           target="_blank"
           rel="noopener noreferrer">{{lang.howToUse}}</a>
      </div>
      <div v-if="nativeDetected && initialRefresh" class="sessions-container">
        <session-sidebar></session-sidebar>
        <div class="session-column">
          <ios-banner></ios-banner>
          <rating-banner></rating-banner>
          <sessions></sessions>
        </div>
        <session-hub></session-hub>
      </div>
    </div>
    <footer>
      <a class="link" href="mailto:support@mytab.space">{{lang.contact}}</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://mytab.space" target="_blank">{{lang.about}}</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://mytab.space/#faq" target="_blank" rel="noopener">FAQ</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://mytab.space/privacy.html" target="_blank" rel="noopener">{{lang.privacy}}</a>
      <a class="link footer-credit" href="https://joyuer.cn/" target="_blank" rel="noopener">{{lang.madeBy}}</a>
    </footer>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { VueLoading } from 'vue-loading-template'
  import { mapState, mapGetters } from 'vuex'

  import IosBanner from '../components/IosBanner'
  import Navbar from '../components/Navbar'
  import RatingBanner from '../components/RatingBanner'
  import SessionSidebar from '../components/SessionSidebar'
  import SessionHub from '../components/SessionHub'
  import Sessions from '../components/Sessions'
  import SwitcherHint from '../components/SwitcherHint'

  export default {
    components: {
      VueLoading,
      IosBanner,
      Navbar,
      RatingBanner,
      SessionSidebar,
      SessionHub,
      Sessions,
      SwitcherHint,
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
      ...mapGetters(["isPremium", "switcherHintAvailable"]),
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
    flex-wrap: wrap;
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

  /* Subscription marker, set as a superscript on the wordmark rather than a
     second upsell surface. */
  .pro-badge {
    display: inline-block;
    margin-left: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    background: linear-gradient(135deg, #fa8072, #eb5205);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.2;
    text-transform: uppercase;
    vertical-align: super;
    cursor: default;
  }

  #title:not(.title-centered) h1 {
    margin-left: var(--dashboard-sidebar-column);
    transform: translateY(-12px);
  }

  /* The switcher hint extends the search column downward, so the wordmark
     rides a little higher to hold the same optical balance. */
  #title.with-hint:not(.title-centered) h1 {
    transform: translateY(-24px);
  }

  #title.title-centered {
    justify-content: center;
  }

  .footer-sep {
    width: 10px;
  }

  .footer-credit {
    flex-basis: 100%;
    margin: 6px 0 12px;
    text-align: center;
    font-size: 12px;
    opacity: 0.7;
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

  .session-column .ios-banner,
  .session-column .rating-banner {
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
      /* Stacked layout: the rail sits above the list, so pinning it would just
         eat the screen. */
      position: static;
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

  .empty-state-tip {
    margin: 6px auto 10px;
    max-width: 420px;
    font-size: 14px;
    line-height: 1.5;
  }

  .empty-state-link {
    font-size: 14px;
  }

  /* The search field and the tab-switcher hint under it move as one block, so
     the hint keeps the field's right edge instead of drifting into the hub
     column. */
  .search-area {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin: 10px 0;
    margin-left: auto;
    /* align right edge with the session cards (hub column = 15px gap + 30px button) */
    margin-right: var(--dashboard-hub-column);
  }

  /* The field and the hint below it flush-stack into one block. */
  .search-field {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* One salmon leading bar runs the whole height of the pair, so the field
     and the hint below it read as a single element. A little transparency
     keeps it from shouting next to the coral wash of the hint. */
  .search-field.with-hint {
    border-left: 3px solid rgba(250, 128, 114, 0.6);
  }

  /* The hint sits flush under the field, so the seam stays clean: the field's
     bottom corners step aside and the hint's top corners meet them square.
     The left edge of the pair stays a straight line — no rounding there. */
  .search-field.with-hint #keyword {
    border-radius: 0 4px 0 0;
  }

  #keyword {
    outline: none;
    border-radius: 4px;
    border-width: 0;
    height: 30px;
    font-size: 16px;
    color: #444444;
    width: 200px;
    max-width: 100%;
    padding-left: 10px;
  }

  @media (max-width: 700px) {
    #title:not(.title-centered) h1 {
      margin-left: 0;
      transform: none;
    }

    .search-area {
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
