<template>
  <div class="session" :id="session.uuid">
    <div style="display: flex; justify-content: space-between">
      <div>
        <div class="tag-btn handle" v-if="showTagBtns && activeTag === ''" :title="lang.movePrompt">
          <v-icon name="align-justify" :stroke-width="1.8" style="margin-left:1px"></v-icon>
        </div>
        <div
            class="session-title"
            :id="'id'+session.uuid"
            @click.stop="editSessionName(session.uuid)"
            @blur="updateSessionName"
            v-html="highlight(session.title || (`${lang.saveAt} ${(new Date(Number(session.timestamp))).Format('yyyy-MM-dd hh:mm')}`))"
        ></div>
      </div>
      <div style="display:inline-block; white-space:nowrap;">
        <a class="btn" @click.stop="restore(session.uuid, true, false)">
          <v-icon name="external-link" class="btn-icon"></v-icon>
        </a>
        <a class="btn del-btn" @click.stop="restore(session.uuid, false, true)">
          <v-icon name="trash-2" class="btn-icon"></v-icon>
        </a>
        <a
            class="btn del-res-btn"
            @click.stop="restore(session.uuid, true, true)"
        >
          <v-icon name="external-link" class="btn-icon"></v-icon>
          <span style="display: inline-block; transform: translateY(-3px); margin: 0 2px;"> + </span>
          <v-icon name="trash-2" class="btn-icon"></v-icon>
        </a>
        <div class="export">
          <a class="btn del-res-btn">
            <v-icon name="share-2" class="btn-icon"></v-icon>
          </a>
          <export-dropdown :selectedSessions="[session]"></export-dropdown>
        </div>
      </div>
    </div>
    <ul :class="['session-sites', {'collapsed-sites': collapse}]">
      <draggable :disabled="isEditingSession(session) || collapse" :forceFallback="true" fallbackTolerance="10" 
      :list="session.sites" group="shared" @start="() => startDragSite(session)" @end="endDragSite">
        <li :class="{'collapsed-site': collapse}" v-for="(tab, tid) in session.sites" v-bind:key="tid">
          <div v-if="editingSessionUuid === session.uuid">
            <v-icon name="compass" :stroke-width="1.5" style="margin-bottom: -3px"></v-icon>
            <input class="tab-edit" placeholder="url" type="text" v-model="tab.url"><br>
            <v-icon name="corner-down-right" :stroke-width="1" style="margin-left: 30px"></v-icon>
            <input class="tab-edit" placeholder="title" type="text" v-model="tab.title">
          </div>
          <div v-if="!isEditingSession(session) && !collapse" class="del-item" @click="delItem(tid,session)" >
            <small>X</small>
          </div>
          <div v-if="!isEditingSession(session)" class="fav">
            <img
                class="fav-img"
                :src="getFavicon(tab.url)"
                :onerror="`src='${WangYeIcon}'`"
                alt
            />
          </div>
          <span v-if="!isEditingSession(session) && !collapse" class="site-title">
            <span v-if="tabSpaceSettings['remove-site-after-click'] === 'true'" class="link" v-html="highlight(tab.title || tab.url)"
            @click="() => removeAndOpen(tid, session, tab.url)"></span>
            <a v-else class="link" :href="wrapUrl(tab.url)" v-html="highlight(tab.title || tab.url)"></a>
          </span>
        </li>
        <li v-if="isEditingSession(session)">
          <div class="tag-btn" @click="() => { session.sites.push({title: '', url: ''}) }">
            <v-icon name="file-plus" :stroke-width="2" stroke="green"></v-icon>
          </div>
        </li>
      </draggable>
    </ul>
    <div class="session-tags">
      <div
          class="tag"
          v-for="tag in session.tags"
          @click="removeTag(tag.name, session)"
          v-bind:key="tag.name"
      >
        {{ tag.name }}
      </div>
      <div class="tag-btn" :title="lang.tagPrompt" v-if="tagEditorId !== session.uuid" @click="e => addTag(e, session.uuid)">
        <v-icon name="tag" style="margin-bottom: -4px" :stroke-width="1.5"></v-icon>
      </div>
      <vue-autosuggest
        class="autosuggest"
        v-if="tagEditorId === session.uuid"
        v-model="tagKeyword"
        :suggestions="[{data: tagOptions(session.tags)}]"
        :should-render-suggestions="shouldRenderTagSuggestions" 
        :input-props="{id: 'autosuggest__input', placeholder: lang.tagPrompt, autofocus: 'autofocus'}"
        @blur="saveTag"
        @selected="chooseTag"
      >  
        <template slot-scope="{suggestion}">
          <span class="suggest-tag">{{suggestion.item}}</span>
        </template>
      </vue-autosuggest>
      <div class="tag-btn" v-if="showTagBtns || isFavorite(session)" @click="() => toggleFavorite(session)">
        <v-icon name="star" :stroke-width="1.5"
        :fill="isFavorite(session) ? 'salmon' : 'none'"
        :stroke="isFavorite(session) ? 'salmon' : 'currentColor'"
        ></v-icon>
      </div>
      <div v-if="showTagBtns" style="display: flex; transition: 3s">
        <div :title="lang.editPrompt" v-if="editingSessionUuid !== session.uuid" class="tag-btn" 
        @click="() => { editingSessionUuid = session.uuid; session.sites.push({title: '', url: ''})}">
          <v-icon name="edit" :stroke-width="1.5"></v-icon>
        </div>
        <div v-else class="tag-btn" @click="() => { editingSessionUuid = ''; updateSession(session) }">
          <v-icon name="check" :stroke-width="4" stroke="green"></v-icon>
        </div>
        <div class="tag-btn" :title="lang.topPrompt" @click="() => upSession(session)">
          <v-icon name="arrow-up-circle" :stroke-width="1.5"></v-icon>
        </div>
        <div class="tag-btn" :title="lang.mergePrompt" v-if="mergeEditorId !== session.uuid" 
          @click="() => mergeEditorId = session.uuid">
          <v-icon name="git-merge" :stroke-width="1.8"></v-icon>
        </div>
        <vue-autosuggest
          class="autosuggest"
          id="mergeSuggest"
          v-if="mergeEditorId === session.uuid"
          v-model="mergeKeyword"
          :suggestions="[{data: (() => mergeOptions(session.uuid))()}]"
          :should-render-suggestions="shouldRenderMergeSuggestions" 
          :input-props="{id: 'autosuggest__input_merge', placeholder: lang.mergePrompt, autofocus: 'autofocus'}"
          @selected="(s) => chooseMerge(s.item, session)"
        >  
          <template slot-scope="{suggestion}">
            <span>{{suggestion.item.title}}</span>
          </template>
        </vue-autosuggest>
      </div>
    </div>
  </div>
</template>

<script>
  import { mapState, mapGetters } from 'vuex';
  import { VueAutosuggest } from 'vue-autosuggest';

  import WangYeIcon from '../assets/img/icon-webpage.svg';
  import Draggable from 'vuedraggable';
  import ExportDropdown from './ExportDropdown';

  export default {
    name: "SessionCard",
    components: {
      Draggable,
      ExportDropdown,
      VueAutosuggest
    },
    props: ["session", "showTagBtns"],
    data() {
      return {
        tagEditorId: false,
        mergeEditorId: false,
        WangYeIcon: WangYeIcon,
        tagKeyword: "",
        mergeKeyword: ""
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "keyword", "collapse", "sessions", "activeTag", "editingSessionUuid", "tabSpaceSettings"]),
      ...mapGetters(["tags"]),
      editingSessionUuid: {
        get() {
          return this.$store.state.editingSessionUuid
        },
        set(id) {
          this.$store.commit("setEditingSessionUuid", id)
        }
      },
      tagOptions() {
        return function(exsitingTags) {
          exsitingTags = exsitingTags.map(t => t.name)
          if (Array.isArray(this.tags)) {
            let pattern = ".*" + this.tagKeyword.toLowerCase().split("").join(".*") + ".*"
            return this.tags.filter(tag => {
              let res = tag.toLowerCase().match(new RegExp(pattern, "gi"))
              return exsitingTags.indexOf(tag) === -1 && (res && res[0]) === tag.toLowerCase()
            })
          }
          return []
        }
      }
    },
    watch: {
      showTagBtns() {
        this.tagEditorId = false
        this.mergeEditorId = false
      }
    },
    methods: {
      mergeOptions(selfUuid) {
        if (Array.isArray(this.sessions)) {
          let pattern = ".*" + this.mergeKeyword.toLowerCase().split("").join(".*") + ".*"
          return this.sessions.filter(session => {
            let res = session.title.toLowerCase().match(new RegExp(pattern, "gi"))
            return session.uuid !== selfUuid && (res && res[0]) === session.title.toLowerCase()
          })
        }
        return []
      },
      isEditingSession(session) {
        return this.editingSessionUuid === session.uuid
      },
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
        sessions.forEach(session => {
          if (session.uuid.slice(0,3) === "new") {
            this.$store.commit("spliceSessions", {start: this.sessions.findIndex(s => s.uuid = session.uuid), deleteCount: 1, items: []})
          }
        })
        sessions = sessions.filter(s => s.uuid.slice(0,3) !== "new")
        if (sessions.filter(s => s.sites.length === 0).length > 0)
          this.bridge.send({ cmd: 'DeleteSession', bookmarks: sessions.filter(s => s.sites.length === 0) })
        sessions.filter(s => s.sites.length > 0).forEach(s => {
          if (s.tags.map(t => t.name).includes("@Trash")) this.bridge.send({ cmd: 'DeleteSession', bookmarks: [s] })
          else this.setTag("@Trash", s)
        })
      },
      updateSession(session) {
        // delete session without any sites
        console.log(session)
        session.sites = session.sites.map(site => {
          if (site.url && !site.title) return {url: site.url, title: site.url}
          else return site
        })
        session.sites = session.sites.filter(site => site.title && site.url)
        if (session.sites.length === 0) {
          this.removeSessions([session])
        } else {
          let isNewSession = session.uuid.slice(0,3) === "new"
          this.bridge.send({ cmd: isNewSession ? 'AppendSessions' : 'UpdateSession', bookmarks: [session] })
        }
      },
      upSession(session) {
        this.bridge.send({ cmd: 'UpSession', bookmarks: [session]})
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
          if (session) {
            this.bridge.send({ cmd: 'RestoreSession', bookmarks: [session]})
          }
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
      removeAndOpen(tid, session, url) {
        this.delItem(tid, session)
        window.open(url)
      },
      delItem(tid, session) {
        session.sites.splice(tid, 1)
        this.updateSession(session)
      },
      addTag(e, id) {
        this.tagEditorId = id
      },
      setTag(tagName, session) {
        if (!tagName) return
        if (!session.tags.map(t => t.name).includes(tagName)) {
          session.tags.push({name: tagName})
        }
        this.tagKeyword = ""
        this.updateSession(session)
      },
      saveTag() {
        setTimeout(() => {
          let session = this.getSessionById(this.tagEditorId) 
          this.setTag(this.tagKeyword, session)
          this.tagEditorId = false
        }, 100)
      },
      chooseTag(tag) {
        let session = this.getSessionById(this.tagEditorId) 
        this.setTag(tag.item, session)
        this.tagEditorId = false
      },
      chooseMerge(session, toSession) {
        this.bridge.send({ cmd: 'MergeSessions', bookmarks: [toSession, session]})
        this.mergeEditorId = false
      },
      removeTag(tag, session) {
        session.tags = session.tags.filter(t => t.name !== tag)
        this.updateSession(session)
      },
      shouldRenderTagSuggestions(size, loading) {
        return size > 0 && (this.tagKeyword === "" || !loading)
      },
      shouldRenderMergeSuggestions(size, loading) {
        return size > 0 && (this.mergeKeyword === "" || !loading)
      },
      isFavorite(session) {
        return Boolean(session.tags.find(t => t.name === "@Favorite"))
      },
      toggleFavorite(session) {
        if (this.isFavorite(session)) {
          session.tags = session.tags.filter(t => t.name !== "@Favorite")
        } else {
          session.tags.push({name: "@Favorite"})
        }
        this.updateSession(session)
      },
      getSessionIdFromDraggingSite(site) {
        return site.parentElement.parentElement.firstElementChild.firstElementChild.lastElementChild.id.slice(2)
      },
      startDragSite(session) {
        let timestamp = (new Date()).getTime()
        this.newSession = {
          uuid: "new-" + timestamp,
          title: "",
          timestamp,
          sites: [],
          tags: this.activeTag ? [{name: this.activeTag}] : []
        }
        this.crtId = this.sessions.findIndex(i => i.uuid === session.uuid)
        this.$store.commit("spliceSessions", {start: this.crtId + 1, deleteCount: 0, items: [this.newSession]})
      },
      endDragSite(e) {
        if (this.newSession.sites.length === 0) this.$store.commit("spliceSessions", {start: this.crtId + 1, deleteCount: 1, items: []})
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
  .handle {
    position: absolute;
    margin-left: -24px;
  }

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
    /* transform: translateY(-0.5px); */
    box-shadow: rgba(46, 41, 51, 0.0784314) 0 2px 4px, rgba(71, 63, 79, 0.156863) 0 5px 10px;
  }

  .session-tags {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    margin-top: 6px;
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

  .btn-icon {
    color: white;
    width: 14px;
  }

  .tag-btn {
    opacity: 1;
    margin-top: 2px;
    margin-right: 4px;
    width: 20px;
    height: 20px;
    cursor: pointer;
    transition: 0.6s;
  }

  .tag-btn:hover {
    opacity: 0.7;
    transition: 0.1s;
  }

  .session-title {
    font-size: 18px;
    font-weight: bold;
    transition: box-shadow .2s linear;
    box-shadow: inset 0 -10px #fadc23;
    display: inline-block;
    min-height: 22px;
    max-width: 350px;
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

  .session-sites {
    user-select: none; 
    transition: 0.2s;
    margin: 0 0 0 -45px;
  }

  .collapsed-sites {
    margin-top: 5px;
    margin-left: -10px;
    padding-right: 25px;
  }

  .collapsed-site {
    display: inline-block;
    margin: 0;
    padding: 0;
    transition: 0.2s;
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
    min-width: 40px;
    text-align: center;
    box-shadow: 0.5px 0.5px 0.5px rgba(46, 41, 51, 0.0784314);
  }

  .btn:hover {
    opacity: 0.8;
    transition: 0.1s;
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
    width: 14px;
    height: 14px;
  }

  .fav-img {
    width: 14px;
    height: 14px;
  }

  .del-item {
    padding:0 10px;
    color: #eb5205;
    display: none;
    font-weight: bold;
    font-style: italic;
    cursor: pointer;
  }

  .tab-edit {
    background-color: #dedede;
    outline: none;
    border-radius: 3px;
    border-width: 0;
    padding-left: 5px;
    width: 400px;
    font-size: 14px;
    height: 18px;
    line-height: 18px;
    margin: 4px;
  }

  @media (prefers-color-scheme: dark) {
    .tab-edit {
      background-color: #555;
    }

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

    .tag {
      background-color: #555555;
      border: #555555;
      color: #eeeeee;
    }
  }

</style>
