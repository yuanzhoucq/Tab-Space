<template>
  <div>
    <div id="main">
      <navbar></navbar>
      <div id="title">
        <h1 style="display: inline-block; margin-left: 125px;">Tab Space</h1>
        <input type="text" name="keyword" id="keyword" v-model="keyword"
               placeholder="Search title, url, tag...">
      </div>
      <div v-if="!bridge || !initialRefresh" style="margin-top: 160px; color: #999999">
        <vue-loading type="bars" color="#eb5205" :size="{ width: '50px', height: '50px' }"></vue-loading>
        <p align="center">Connecting to Tab Space App...</p>
        <p v-if="showConnectRetry" align="center" style="font-size: 13px;">
          Taking longer than expected.
          <a class="link" href="#" @click.prevent="reload">Click to retry</a>
        </p>
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
      <a class="link" href="https://joyuer.notion.site/Tab-Space-FAQ-6d9383b54d704f6d85d404be96c31dd5" target="_blank">FAQ</a>
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
        showConnectRetry: false
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "sessions", "initialRefresh"])
    },
    watch: {
      keyword(value) {
        _.debounce(() => this.$store.commit('setKeyword', value), 500)()
      }
    },
    mounted() {
      setTimeout(() => {
        if (!this.bridge || !this.initialRefresh) {
          this.showConnectRetry = true
        }
      }, 8000)
    },
    methods: {
      reload() {
        window.location.reload()
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
    height: 80px;
    width: 840px;
    margin: 10px auto 0;
    display: flex;
    justify-content: space-between;
    align-items: start;
  }

  #title input {
    margin-top: 35px;
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
    margin-top: 20px;
    outline: none;
    border-radius: 4px;
    border-width: 0;
    height: 30px;
    font-size: 16px;
    color: #444444;
    width: 200px;
    padding-left: 10px;
    margin-left: auto;
    margin-right: 64px;
  }

  .highlight {
    background-color: #fadd23;
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
  }
</style>
