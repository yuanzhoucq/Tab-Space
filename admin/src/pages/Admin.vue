<template>
  <div>
    <div id="main">
      <navbar></navbar>
      <div id="title">
        <h1 style="display: inline-block; margin-left: 125px;">Tab Space</h1>
        <div id="notification" v-if="notificationCount && notificationCount !== '0' && notificationCount !== tabSpaceSettings['notification-count']">
          <span @click="openNewMsgPage">New message</span>&nbsp;
          <span v-if="showCloseMsg" @click="closeNewMsgBox">×</span>
        </div>
        <input type="text" name="keyword" id="keyword" v-model="keyword"
               placeholder="Search title, url, tag...">
        <div style="width: 55px"></div>
      </div>
      <div v-if="!bridge || !initialRefresh" style="margin-top: 160px; color: #999999">
        <vue-loading type="bars" color="#eb5205" :size="{ width: '50px', height: '50px' }"></vue-loading>
        <p align="center">Connecting to Tab Space App...</p>
      </div>
      <div class="lose-tabs" v-if="bridge && sessions.length < 1">
        <span><a class="link" @click="reload" href="#">{{lang.loseTabs}}</a></span><br/><br/>
        <router-link class="link" to="/settings">{{lang.migrateTip}}</router-link>
      </div>
      <div v-if="bridge" class="sessions-container">
        <session-sidebar></session-sidebar>
        <sessions></sessions>
        <session-hub></session-hub>
      </div>
    </div>
    <footer>
      <a class="link" href="mailto:joyuercn@icloud.com">{{lang.contact}}</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://twitter.com/joyuer/status/1164816334305157120" target="_blank">Twitter</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://mytab.space" target="_blank">{{lang.about}}</a>
      <span class="footer-sep"></span>
      <a class="link" href="https://www.notion.so/joyuer/Tab-Space-FAQ-6d9383b54d704f6d85d404be96c31dd5" target="_blank">FAQ</a>
    </footer>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { VueLoading } from 'vue-loading-template'
  import { mapState } from 'vuex'

  import Navbar from '../components/Navbar'
  import SessionSidebar from '../components/SessionSidebar'
  import SessionHub from '../components/SessionHub'
  import Sessions from '../components/Sessions'

  export default {
    components: {
      VueLoading,
      Navbar,
      SessionSidebar,
      SessionHub,
      Sessions,
    },
    data() {
      return {
        keyword: "",
        notificationCount: "",
        showCloseMsg: false
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "sessions", "initialRefresh", "tabSpaceSettings"])
    },
    watch: {
      keyword(value) {
        _.debounce(() => this.$store.commit('setKeyword', value), 500)()
      }
    },
    mounted() {
      setTimeout(() => {
        fetch(this.$myConfig.staticResourceEndpoint + "/notificationCount.json").then(r => r.json()).then(r => {
          this.notificationCount = String(r["count"])
        })
      }, 1000)
    },
    methods: {
      reload() {
        window.location.reload()
      },
      openNewMsgPage() {
        this.showCloseMsg = true
        window.open("https://joyuer.notion.site/Tab-Space-Messages-cfd1c7fec58d4b36876b8484637745c2")
      },
      closeNewMsgBox() {
        this.bridge.send({cmd: "SetDefault", name: "notification-count", value: this.notificationCount})
      }
    }
  }
</script>

<style>
  body {
    background-image: linear-gradient(-45deg, #efefef, #fbfbfb);
    font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;
  }

  li {
    list-style: none;
    padding: 4px 0 4px 15px;
    margin-right: 60px;
    display: flex;
    align-items: center;
  }

  li:hover .del-item {
    display: block;
    margin-left: -29.5px;
    transition: 0.3s;
  }

  #main {
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
  }

  li .link {
    font-size: 14px;
    font-weight: 500;
  }

  .link:hover {
    box-shadow: inset 0 -10px rgba(0, 181, 29, 0.17451);
    color: rgb(0, 181, 29);
  }

  #title {
    width: 840px;
    margin: -20px auto 0;
    display: flex;
    justify-content: space-between;
    align-items: end;
  }

  .footer-sep {
    width: 10px;
  }

  .sessions-container {
    display: flex;
    transition: 0.2s;
    flex-direction: row;
    justify-content: left;
    width: 840px;
    margin: 0 auto;
  }

  .session-move {
    transition: transform 0.5s;
  }

  .export:hover .export-dropdown {
    display: block;
  }

  .import:hover .import-dropdown {
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

  .lose-tabs {
    max-width: 600px;
    text-align: center;
    text-decoration: underline;
    margin: 20px auto;
    color: #444444;
    padding: 3px 10px;
    font-size: 12px;
  }

  #keyword {
    margin: 10px;
    outline: none;
    border-radius: 4px;
    border-width: 0;
    height: 30px;
    font-size: 16px;
    color: #444444;
    width: 200px;
    padding-left: 10px;
    margin-left: auto;
  }

  .highlight {
    background-color: #fadd23;
  }

  #notification {
      display: inline-block;
      background-color: #eb2405;
      margin-left: 10px;
      margin-bottom: 40px;
      width: 120px;
      text-align: center;
      padding: 2px;
      border-radius: 5px;
      color: white;
      cursor: pointer;
    }

  @media (prefers-color-scheme: dark) {
    body {
      background-image: linear-gradient(-45deg, #343434, #343536);
      color: #eeeeee;
    }

    input {
      background-color: #252525;
      color: #d0d0d0;
    }

    .link {
      color: #d0d0d0;
    }

    #keyword {
      color: #eeeeee;
    }

    .highlight {
      background-color: #fadd236e;
      color: #ffffff;
    }
  }
</style>
