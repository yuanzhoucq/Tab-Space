<template>
  <div>
    <div id="main">
      <div class="msg" v-if="msg && safariMainVersion < 13"><span class="msg-prompt">Note:</span> {{msg}}</div>
      <nav align="right">
        <div class="export">
          <span class="link">{{lang.export}}<small>▼</small></span>
          <div class="export-dropdown">
            <span class="link" href="#" @click="exportTabs('Text')">{{lang.exportText}}</span>
            <br><span class="link" href="#" @click="exportTabs('MD')">{{lang.exportMD}}</span>
            <br><span class="link" href="#" @click="exportTabs('HTML')">{{lang.exportHTML}}</span>
            <br><span class="link" href="#" @click="exportTabs('JSON')">{{lang.exportJSON}}</span>
          </div>
        </div>
        <label for="file-input" class="link">{{lang.import}}<small>(<code>.tabspace</code>)</small></label>
        <input type="file" id="file-input" @change="importTabs" accept=".tabspace">
        <a class="link" target="_blank" href="https://joyuer.cn/Tab-Space/settings.html">{{lang.settings}}</a>
      </nav>
      <div id="title">
        <h1 style="display: inline-block; padding-left: 130px">Tab Space</h1>
        <input type="text" name="keyword" id="keyword" v-model="keyword"
               placeholder="Search title, url, tag...">
      </div>
      <div v-if="!iframeLoaded" style="margin-top: 160px; color: #999999">
        <vue-loading type="bars" color="#eb5205" :size="{ width: '50px', height: '50px' }"></vue-loading>
        <p align="center">Connecting to Tab Space App...</p>
      </div>
      <div class="lose-tabs" v-if="iframeLoaded && safariMainVersion === 13 && this.sessions.length < 1">
        <span class="link"><a :href="lang.loseTabsLink" target="_blank">{{lang.loseTabs}}</a></span>
      </div>
      <div v-if="iframeLoaded" class="sessions-container">
        <div class="session-filter">
          <div class="tag-filter" :class="{'active-tag': activeTag===''}" @click="()=>activeTag=''">
            <b>{{ lang.all }}</b>
          </div>
          <div class="tag-filter upper-border" v-for="tag in tags" v-bind:key="tag"
               :class="{'active-tag': activeTag===tag}"
               @click="()=>activeTag=tag">{{tag}}
          </div>
          <div class="tips">{{ lang.cloudTips }}</div>
        </div>
        <div v-if="displaySessions.length===0" class="session-placeholder">Nothing here...</div>
        <draggable :disabled="sessions.length!==displaySessions.length" :list="sessions" @end="endDragSession">
          <transition-group tag="div" name="session" v-bind:css="false"
                            v-on:before-enter="beforeEnter"
                            v-on:enter="enter"
                            v-on:leave="leave"
          >
            <div class="session" v-for="session in displaySessions" :key="session[0]">
              <div class="session-title" :id="'id'+session[0]" @click.stop="editSessionName(session[0])"
                   @blur="updateSessionName" v-html='highlight(session[2] || (`${lang.saveAt} ${(new Date(Number(session[0]))).Format("yyyy-MM-dd hh:mm")}`))'
              >
              </div>
              <a class="btn" @click.stop="restore(session[0], true, false)">{{lang.restore}}</a>
              <a class="btn del-btn" @click.stop="restore(session[0], false, true)">{{lang.delete}}</a>
              <a class="btn del-res-btn" @click.stop="restore(session[0], true, true)">{{lang.restoreAndDel}}</a>
              <div class="export">
                <a class="btn del-res-btn">{{lang.export}}<small>▼</small></a>
                <div class="export-session-dropdown">
                  <span class="link" href="#" @click="exportTabs('Text', [session])">{{lang.exportText}}</span><br>
                  <span class="link" href="#" @click="exportTabs('MD', [session])">{{lang.exportMD}}</span><br>
                  <span class="link" href="#" @click="exportTabs('HTML', [session])">{{lang.exportHTML}}</span>
                </div>
              </div>
              <ul class="session-sites" style="user-select: none">
                <draggable :forceFallback="true" :list="session[1]" group="shared" @end="endDragSite">
                <li v-for="(tab, tid) in session[1]" v-bind:key="tid">
                  <div class="del-item" @click="delItem(tid,session)"><small>X</small></div>
                  <div class="fav"><img class="fav-img" :src="getFavicon(tab[1])" :onerror="`src='${WangYeIcon}'`"
                                        alt="">
                  </div>
                  <span class="site-title"><a class="link" :href="tab[1]" v-html="highlight(tab[0] || tab[1])"></a></span>
                </li>
                </draggable>
              </ul>
              <div class="session-tags">
                <div class="tag" v-for="tag in (session[3] || [])" @click="removeTag(tag, session)" v-bind:key="tag">{{
                  tag }}
                </div>
                <div class="tag-prompt" v-if="!session[3] || session[3].length === 0">{{lang.tagPrompt}}</div>
                <div class="add-tag" v-if="tagEditorId !== session[0]" @click="e => addTag(e, session[0])"></div>
                <div class="tag-editor" v-if="tagEditorId === session[0]">
                  <input type="text" @blur="saveTag" autofocus/>
                </div>
              </div>
            </div>
          </transition-group>
        </draggable>
      </div>
    </div>
    <iframe id="bridgeStorage" src="http://tabspacestatic.joyuer.cn/storage.html?method=get" height="0"
            frameborder="0"></iframe>
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
  import draggable from 'vuedraggable'
  import LangData from '../lang.json'
  import Velocity from 'velocity-animate'
  import WangYeIcon from '../assets/img/icon_wangye.svg'

  import {validateSessionsArray, download, Clipboard} from '../utility.js'
  let SafariVersion = 13;
  try {
    SafariVersion = Number(navigator.appVersion.match(/Version\/(\d{1,2})\.\d+/)[1]) // "13" for the newest
  } catch (e) {
    console.log('Not using Safari.')
  }
  export default {
    components: {
      VueLoading,
      draggable
    },
    data() {
      return {
        safariMainVersion: SafariVersion,
        msg: "",
        sessions: [],
        displaySessions: [],
        lang: LangData[navigator.language.toLowerCase()] || LangData["en-us"],
        activeId: "",
        tmpText: "",
        tagEditorId: false,
        activeTag: "",
        keyword: "",
        iframe: null,
        iframeLoaded: false,
        newSession: null,
        shouldBackupForOne: true,
        WangYeIcon: WangYeIcon
      }
    },
    mounted() {
      this.iframe = document.querySelector("#bridgeStorage")
      this.iframe.onload = () => {
        console.log("Bridge iframe loaded.")
        this.iframeLoaded = true
      }
      window.addEventListener("message", evt => {
        // Filter out other sites' postMessage
        if (evt.origin.indexOf("joyuer.cn") === -1 && evt.origin.indexOf("yuanzhoucq.github.io") === -1) return
        if (evt.data.cmd === "ReturnBookmarks") {
          console.log("Received checked bookmarks from Tab Space.app.")
          this.syncBookmarks(evt)
        }
      })
      const info = {
        "en-US": {
          "msg": "Please export your tabs before upgrading to Safari 13, or your sessions may disappear."
        },
        "zh-CN": {
          "msg": "请在升级到 Safari 13 前导出您保存的标签，否则您保存的会话可能会消失。"
        }
      }
      const localizedRes = info[navigator.language] || info["en-US"]
      this.msg = localizedRes.msg
      document.addEventListener('keydown', e => {
        if (e.code === 'Enter') {
          e.preventDefault()
          try {
            document.querySelector('.tag-editor input').blur()
          } catch (e) {
            console.log(e)
          }
          try {
            document.querySelector(`#id${this.activeId}`).blur()
          } catch (e) {
            console.log(e)
          }
        }
      })
    },
    filters: {
      wrap: (value) => {
        return (value.length > 53 ? value.slice(0, 50) + "..." : value)
      }
    },
    computed: {
      tags() {
        let tags = []
        this.sessions.forEach(session => {
          session[3] && session[3].forEach(tag => !tags.includes(tag) && tags.push(tag))
        })
        return tags
      },
    },
    watch: {
      sessions() {
        this.getDisplaySessions()
      },
      activeTag() {
        this.getDisplaySessions()
      },
      keyword() {
        this.debouncedGetDisplaySessions()
      }
    },
    created() {
      this.debouncedGetDisplaySessions = _.debounce(this.getDisplaySessions, 300)
    },
    methods: {
      highlight(value) {
        let re = new RegExp(this.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i")
        let res = value.match(re)
        if (res) return value.replace(res[0], `<span style="background-color: #fadc23;">${res[0]}</span>`)
        return value
      },
      getDisplaySessions() {
        let displaySessions = this.sessions;
        if (this.activeTag)
          displaySessions = displaySessions.filter(session => session[3] && session[3].includes(this.activeTag))
        if (this.keyword)
          displaySessions = displaySessions.filter(session =>
            JSON.stringify(session).toLowerCase().includes(this.keyword.toLowerCase()))
        this.displaySessions = displaySessions
      },
      syncBookmarks(evt) {
        if (this.iframeLoaded) {
          try {
            const bookmarks = JSON.parse(evt.data.bookmarks)
            if (validateSessionsArray(bookmarks)) {
              this.sessions = bookmarks
            }
          } catch (e) {
            console.log("Synced bookmarks are not valid.")
          }
        } else {
          setTimeout(() => this.syncBookmarks(evt), 200)
        }
      },
      getSessionById(id) {
        return this.sessions.find(session => session[0] === id)
      },
      removeSessions(sessions) {
        this.iframe.contentWindow.postMessage({cmd: 'DeleteSession', bookmarks: sessions}, "*")
      },
      updateSession(session) {
        if (!validateSessionsArray([session])) throw Error("Invalid session!")
        // delete session without any sites
        if (session[1].length === 0) {
          this.removeSessions([session])
        } else {
          this.iframe.contentWindow.postMessage({cmd: 'UpdateSession', bookmarks: [session]}, "*")
        }
      },
      getFavicon(url) {
        let origin = (new URL(url)).origin
        return origin + "/favicon.ico"
      },
      restore(key, open, del) {
        if (open) {
          let session = this.sessions.find(s => s[0] === key)
          session && session[1].forEach(site => window.open(site[1]))
        }
        if (del) {
          const sessionsToDelete = this.sessions.filter(session => session[0] === key)
          this.removeSessions(sessionsToDelete)
        }
      },
      editSessionName(id) {
        this.activeId = id
        const div = document.querySelector(`#id${id}`)
        div.setAttribute('contentEditable', "true")
        div.style.minWidth = "150px";
        div.focus()
        this.tmpText = div.innerText
        document.execCommand('selectAll', false, null)
      },
      updateSessionName() {
        const div = document.querySelector(`#id${this.activeId}`)
        div.style.minWidth = "0";
        let session = this.getSessionById(this.activeId)
        session[2] = div.innerText
        if (session[2]) this.updateSession(session)
        else div.innerText = this.tmpText
      },
      delItem(tid, session) {
        session[1].splice(tid, 1)
        this.updateSession(session)
      },
      addTag(e, id) {
        this.tagEditorId = id
      },
      saveTag(e) {
        if (e.target.value) {
          let session = this.getSessionById(this.tagEditorId)
          if (session.length === 2) session.push("")
          if (session.length === 3) session.push([e.target.value])
          else {
            !session[3].includes(e.target.value) && session[3].push(e.target.value)
          }
          this.updateSession(session)
        }
        this.tagEditorId = false
      },
      removeTag(tag, session) {
        session[3].splice(session[3].indexOf(tag), 1)
        this.updateSession(session)
      },
      sessionTo(type, session) {
        let s = ""
        switch (type.toLowerCase()) {
          case 'text':
            s += (session[2] || (`${this.lang.saveAt} ${(new Date(Number(session[0]))).Format("yyyy-MM-dd hh:mm")}`))
            session[1].forEach(i => {
              s += "\n- ";
              if (i[0]) s += i[0] + ": ";
              s += i[1]
            })
            break
          case 'md':
            s += "# " + (session[2] || (`${this.lang.saveAt} ${(new Date(Number(session[0]))).Format("yyyy-MM-dd hh:mm")}`))
            session[1].forEach(i => { s += `\n- [${i[0]}](${i[1]})` })
            break
        }
        return s
      },
      importTabs(e) {
        const file = new FileReader()
        file.onload = e => {
          const importedSessions = JSON.parse(e.target.result)
          if (!validateSessionsArray(importedSessions)) alert("Error: invalid data!")
          else {
            this.iframe.contentWindow.postMessage({cmd: 'AppendSession', bookmarks: importedSessions}, "*")
          }
        }
        file.readAsText(e.target.files[0])
      },
      exportTabs(type, data) {
        let tabs = data || this.sessions
        let s = ""
        let exported
        switch (type.toLowerCase()) {
          case 'html':
            fetch("export.html").then(r => r.text()).then(r => {
              let content = r.replace("JSON.parse(localStorage.getItem(\"bookmarks\") || \"[]\")", JSON.stringify(tabs))
              content = content.replace("<h1>Tab Space</h1>", `<h1>{{lang.exportTitle}}</h1>`)
              content = content.replace(`lang: {}`, `lang: ${JSON.stringify(this.lang)}`)
              download("Tab-Space-Exported.html", content)
            })
            break
          case 'json':
            exported = tabs.map(session => {
              let s = [...session]
              s[0] = String(1 + Number(s[0]))
              return s
            })
            download("backup.tabspace", JSON.stringify(exported))
            break
          case 'text':
            tabs.forEach(i => s += this.sessionTo('text', i) + "\n\n")
            Clipboard.copy(s)
            break
          case "md":
            tabs.forEach(i => s += this.sessionTo('md', i) + "\n\n")
            Clipboard.copy(s)
            break
          default:
            console.log(123)
        }
        let text = this.lang['export' + type]
        this.lang['export' + type] = "OK"
        setTimeout(() => this.lang['export' + type] = text, 1000)
      },
      // List animation
      beforeEnter: function (el) {
        el.style.opacity = 0
      },
      enter(el, done) {
        setTimeout(function () {
          Velocity(
            el,
            { opacity: 1 },
            { complete: done }
          )
        }, 0)
      },
      leave(el, done) {
        el.style.padding = 0
        el.style.height = 0
        el.style.margin = 0
        el.style.opacity = 0.1
        setTimeout(function () {
          Velocity(
            el,
            { opacity: 0 },
            { complete: done }
          )
        }, 0)
      },
      endDragSession(e) {
        if (e.newIndex !== e.oldIndex) {
          this.iframe.contentWindow.postMessage({cmd: 'SwapSession', index: [Number(e.newIndex), Number(e.oldIndex)]}, "*")
        }
      },
      getSessionIdFromDraggingSite(site) {
        return site.parentElement.parentElement.firstElementChild.id.slice(2)
      },
      endDragSite(e) {
        const fromId = this.getSessionIdFromDraggingSite(e.from)
        const toId = this.getSessionIdFromDraggingSite(e.to)
        if (fromId === toId) {
          if (e.newIndex !== e.oldIndex) {
            this.updateSession(this.sessions.find(item => item[0] === fromId))
          }
        }
        else {
          this.updateSession(this.sessions.find(item => item[0] === fromId))
          this.updateSession(this.sessions.find(item => item[0] === toId))
        }

      }
    }
  }
</script>

<style>
  @import "../assets/main.css";
</style>
