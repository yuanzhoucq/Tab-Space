<template>
  <div class="session" :id="session.uuid">
    <div style="display: flex; justify-content: space-between">
      <div
          class="session-title"
          :id="'id'+session.uuid"
          @click.stop="editSessionName(session.uuid)"
          @blur="updateSessionName"
          v-html="highlight(session.title || (`${lang.saveAt} ${(new Date(Number(session.uuid))).Format('yyyy-MM-dd hh:mm')}`))"
      ></div>
      <div style="display:inline-block; white-space: nowrap;">
        <a class="btn" @click.stop="restore(session.uuid, true, false)">{{lang.restore}}</a>
        <a class="btn del-btn" @click.stop="restore(session.uuid, false, true)">{{lang.delete}}</a>
        <a
            class="btn del-res-btn"
            @click.stop="restore(session.uuid, true, true)"
        >{{lang.restoreAndDel}}</a>
        <div class="export">
          <a class="btn del-res-btn">
            {{lang.export}}
            <small>▼</small>
          </a>
          <export-dropdown :selectedSessions="[session]"></export-dropdown>
        </div>
      </div>
    </div>
    <ul class="session-sites" style="user-select: none">
      <draggable :forceFallback="true" :list="session.sites" group="shared" @end="endDragSite">
        <li v-for="(tab, tid) in session.sites" v-bind:key="tid">
          <div class="del-item" @click="delItem(tid,session)">
            <small>X</small>
          </div>
          <div class="fav">
            <img
                class="fav-img"
                :src="getFavicon(tab.url)"
                :onerror="`src='${WangYeIcon}'`"
                alt
            />
          </div>
          <span class="site-title">
                  <a class="link" :href="wrapUrl(tab.url)" v-html="highlight(tab.title || tab.url)"></a>
                </span>
        </li>
      </draggable>
    </ul>
    <div class="session-tags">
      <div
          class="tag"
          v-for="tag in (session.tags || [])"
          @click="removeTag(tag.name, session)"
          v-bind:key="tag.name"
      >
        {{ tag.name }}
      </div>
      <div class="tag-prompt" v-if="session.tags.length === 0">{{lang.tagPrompt}}</div>
      <div
          class="add-tag"
          v-if="tagEditorId !== session.uuid"
          @click="e => addTag(e, session.uuid)"
      ></div>
      <div class="tag-editor" v-if="tagEditorId === session.uuid">
        <input type="text" @blur="saveTag" autofocus/>
      </div>
    </div>
  </div>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'

  import WangYeIcon from '../assets/img/icon_wangye.svg';
  import Draggable from 'vuedraggable';
  import ExportDropdown from './ExportDropdown';

  export default {
    name: "SessionCard",
    components: {
      Draggable,
      ExportDropdown
    },
    props: ["session"],
    data() {
      return {
        tagEditorId: false,
        WangYeIcon: WangYeIcon
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "keyword", "sessions"]),
      ...mapGetters(["displaySessions"]),
    },
    methods: {
      wrapUrl(url) {
        return (url.indexOf("://") === -1) ? "http://" + url : url
      },
      highlight(value) {
        let re = new RegExp(this.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i")
        let res = value.match(re)
        if (res) return value.replace(res[0], `<span class="highlight">${res[0]}</span>`)
        return value
      },
      getSessionById(id) {
        return this.sessions.find(session => session.uuid === id)
      },
      removeSessions(sessions) {
        this.bridge.send({ cmd: 'DeleteSession', bookmarks: sessions })
      },
      updateSession(session) {
        // delete session without any sites
        console.log(session)
        if (session.sites.length === 0) {
          this.removeSessions([session])
        } else {
          this.bridge.send({ cmd: 'UpdateSession', bookmarks: [session] })
        }
      },
      getFavicon(url) {
        try {
          let origin = (new URL(this.wrapUrl(url))).origin
          return origin + "/favicon.ico"
        } catch {
          return ""
        }
      },
      restore(key, open, del) {
        if (open) {
          let session = this.sessions.find(s => s.uuid === key)
          session && session.sites.forEach(site => window.open(site.url))
        }
        if (del) {
          const sessionsToDelete = this.sessions.filter(session => session.uuid === key)
          this.removeSessions(sessionsToDelete)
        }
      },
      editSessionName(id) {
        this.activeId = id
        const div = document.querySelector(`#id${id}`)
        div.setAttribute('contentEditable', "true")
        div.style.whiteSpace = "normal";
        div.style.minWidth = "150px";
        div.focus()
        this.tmpText = div.innerText
        document.execCommand('selectAll', false, null)
      },
      updateSessionName() {
        const div = document.querySelector(`#id${this.activeId}`)
        div.style.whiteSpace = "nowrap";
        div.style.minWidth = "0";
        let session = this.getSessionById(this.activeId)
        session.title = div.innerText
        if (session.title) this.updateSession(session)
        else div.innerText = this.tmpText
      },
      delItem(tid, session) {
        session.sites.splice(tid, 1)
        this.updateSession(session)
      },
      addTag(e, id) {
        this.tagEditorId = id
      },
      saveTag(e) {
        if (e.target.value) {
          let session = this.getSessionById(this.tagEditorId)
          if (!session.tags.map(t => t.name).includes(e.target.value)) {
            session.tags.push({name: e.target.value})
          }
          this.updateSession(session)
        }
        this.tagEditorId = false
      },
      removeTag(tag, session) {
        session.tags = session.tags.filter(t => t.name !== tag)
        this.updateSession(session)
      },
      getSessionIdFromDraggingSite(site) {
        return site.parentElement.parentElement.firstElementChild.firstElementChild.id.slice(2)
      },
      endDragSite(e) {
        const fromId = this.getSessionIdFromDraggingSite(e.from)
        const toId = this.getSessionIdFromDraggingSite(e.to)
        if (fromId === toId) {
          if (e.newIndex !== e.oldIndex) {
            this.updateSession(this.sessions.find(item => item.uuid === fromId))
          }
        } else {
          this.updateSession(this.sessions.find(item => item.uuid === fromId))
          this.updateSession(this.sessions.find(item => item.uuid === toId))
        }
      }
    }
  }
</script>

<style scoped>
  .session {
    border-radius: 5px;
    text-decoration: none;
    width: 600px;
    margin: 0 auto 20px;
    padding: 15px 20px 10px 30px;
    background-color: white;
    box-shadow: rgba(46, 41, 51, 0.0784314) 0 1px 2px, rgba(71, 63, 79, 0.0784314) 0 2px 4px;
    transition-duration: 250ms, 250ms, 250ms;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1);
    transition-property: transform, box-shadow, padding;
  }

  .session:hover {
    transform: translateY(-0.5px);
    box-shadow: rgba(46, 41, 51, 0.0784314) 0 3px 6px, rgba(71, 63, 79, 0.156863) 0 6px 12px;
  }

  .session-tags {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    margin-top: 5px;
  }

  .tag {
    background-color: #f5f5f5;
    border: 1px solid #dddddd;
    padding: 3px;
    color: #333333;
    font-size: 12px;
    border-radius: 8px;
    margin-right: 5px;
    margin-bottom: 5px;
  }

  .tag:hover {
    cursor: pointer;
    text-decoration: line-through;
    opacity: 0.8;
    transition: 0.2s;
  }

  .add-tag {
    background-image: url("../assets/img/icon_tianjia.svg");
    background-repeat: no-repeat;
    background-size: cover;
    opacity: 0.5;
    margin-top: 4px;
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .tag-editor input {
    width: 40px;
    margin-left: 5px;
  }

  .session-title {
    font-size: 20px;
    font-weight: bold;
    transition: box-shadow .2s linear;
    box-shadow: inset 0 -10px #fadc23;
    display: inline-block;
    min-height: 26px;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 20px;
    margin-bottom: 5px;
  }

  .session-title:hover {
    cursor: pointer;
  }

  .site-title {
    white-space: nowrap;
    overflow-x: hidden;
    text-overflow: ellipsis;
  }

  .btn {
    display: inline-block;
    padding: 3px 5px;
    margin-right: 5px;
    color: rgb(255, 255, 255);
    font-family: Helvetica, Arial, sans-serif;
    font-size: 12px;
    height: 16px;
    line-height: 16px;
    background-color: rgb(0, 181, 29);
    cursor: pointer;
    font-weight: 400;
    border-radius: 2px;
    min-width: 50px;
    text-align: center;
  }

  .btn:hover {
    font-weight: 700;
  }

  .del-btn {
    background-color: #eb5205;
  }

  .del-res-btn {
    background-color: #35abe5;
  }

  .tag-prompt {
    font-size: 14px;
    color: #999999;
    margin-top: 2px;
    margin-right: 5px;
  }

  .fav {
    display: inline-block;
    margin-right: 5px;
    width: 16px;
    height: 16px;
  }

  .fav-img {
    width: 16px;
    height: 16px;
  }

  .del-item {
    padding:0 10px;
    color: #eb5205;
    display: none;
    font-weight: bold;
    font-style: italic;
    cursor: pointer;
  }

  .sortable-fallback {
    opacity: 0;
  }

  .sortable-chosen {
    opacity: .5;
  }

  @media (prefers-color-scheme: dark) {
    .session {
      background-color: #252525;
      color: #d0d0d0;
    }

    .link {
      background-color: #00000000;
    }

    .session-title {
      color: #f5f5f5;
      box-shadow: inset 0 -10px #685e02;
    }

    .btn {
      opacity: 0.9;
    }

    .fav > img {
      background-color: #aaaaaa;
      border-radius: 2px;
    }
    .add-tag {
      background-color: #aaaaaa;
      border-radius: 8px;
    }

    .tag {
      background-color: #555555;
      border: #555555;
      color: #eeeeee;
    }
  }

</style>
