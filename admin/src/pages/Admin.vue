<template>
  <div>
    <div id="main">
      <navbar></navbar>
      <div id="title">
        <h1 style="display: inline-block; padding-left: 130px">Tab Space</h1>
        <input type="text" name="keyword" id="keyword" v-model="keyword"
               placeholder="Search title, url, tag...">
      </div>
      <div v-if="!bridge || !initialRefresh" style="margin-top: 160px; color: #999999">
        <vue-loading type="bars" color="#eb5205" :size="{ width: '50px', height: '50px' }"></vue-loading>
        <p align="center">Connecting to Tab Space App...</p>
      </div>
      <div class="lose-tabs" v-if="bridge && sessions.length < 1">
        <span><a class="link" :href="lang.loseTabsLink" target="_blank">{{lang.loseTabs}}</a></span>
      </div>
      <div v-if="bridge" class="sessions-container">
        <session-sidebar></session-sidebar>
        <sessions></sessions>
      </div>
    </div>
    <footer>
      <a class="link" href="mailto:joyuercn@icloud.com">{{lang.contact}}</a><span class="footer-sep"></span>
      <a class="link" href="https://twitter.com/joyuer/status/1164816334305157120" target="_blank">Twitter</a><span
        class="footer-sep"></span>
      <a class="link" href="https://joyuer.cn/Tab-Space" target="_blank">{{lang.about}}</a>
    </footer>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { VueLoading } from 'vue-loading-template'
  import { mapState } from 'vuex'

  import Navbar from '../components/Navbar'
  import SessionSidebar from '../components/SessionSidebar'
  import Sessions from '../components/Sessions'

  export default {
    components: {
      VueLoading,
      Navbar,
      SessionSidebar,
      Sessions,
    },
    data() {
      return {
        keyword: "",
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "sessions", "initialRefresh"])
    },
    watch: {
      keyword(value) {
        _.debounce(() => this.$store.commit('setKeyword', value), 300)()
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
    padding: 4px 0 4px 40px;
    margin-right: 100px;
    display: flex;
    align-items: center;
  }

  li:hover .del-item {
    display: block;
    margin-left: -29.5px;
    transition: 0.3s;
  }

  ul {
    margin: 0 0 0 -45px;
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
  }

  .link:hover {
    box-shadow: inset 0 -10px rgba(0, 181, 29, 0.17451);
    color: rgb(0, 181, 29);
  }

  #title {
    width: 800px;
    margin: -20px auto 0;
  }

  .footer-sep {
    width: 10px;
  }

  .sessions-container {
    display: flex;
    transition: 0.2s;
    flex-direction: row;
    justify-content: left;
    width: 800px;
    margin: 0 auto;
  }

  .session-move {
    transition: transform 0.5s;
  }

  .export:hover .export-dropdown {
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
    margin: 10px 10px 10px 280px;
    outline: none;
    border-radius: 4px;
    border-width: 0;
    height: 30px;
    font-size: 16px;
    color: #444444;
    width: 200px;
    padding-left: 10px;
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

    #keyword {
      color: #eeeeee;
    }

    .highlight {
      background-color: #fadd236e;
      color: #ffffff;
    }
  }
</style>
