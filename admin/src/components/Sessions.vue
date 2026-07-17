<template>
  <div class="sessions-list">
    <div v-if="displaySessions.length===0" class="session-placeholder">{{ lang.nothingHere }}</div>
    <draggable
        handle=".handle"
        :list="displaySessions"
        :disabled="hasSearch"
        :supportPointer="false"
        @end="endDragSession"
    >
      <transition-group
          tag="div"
          name="session"
          v-bind:css="false"
          v-on:before-enter="beforeEnter"
          v-on:enter="enter"
          v-on:leave="leave"
      >
        <session-card v-for="session in displaySessions" :key="session.uuid" :session="session"
          :showTagBtns="hoverId===session.uuid" @mouseenter.native="setHoverId(session.uuid)" @mouseleave.native="() => hoverId=null"
        ></session-card>
      </transition-group>
    </draggable>
  </div>
</template>

<script>
  import Velocity from 'velocity-animate'
  import Draggable from 'vuedraggable';
  import { mapState, mapGetters } from 'vuex'

  import SessionCard from './SessionCard';

  export default {
    name: "Sessions",
    components: {
      Draggable,
      SessionCard,
    },
    data() {
      return {
        hoverId: null,
      }
    },
    computed: {
      ...mapState(["lang", "bridge", "sessions", "activeTag", "keyword"]),
      ...mapGetters(["displaySessions"]),
      hasSearch() {
        return Boolean(this.keyword && this.keyword.trim())
      }
    },
    watch: {
      displaySessions(sessions) {
        if (this.activeTag && sessions.length === 0) this.$store.commit("setActiveTag", "")
      }
    },
    mounted() {
      document.addEventListener('keydown', e => {
        if (e.code === 'Enter') {
          e.preventDefault()
          e.target.blur()
        }
      })
    },
    methods: {
      setHoverId(uuid) {
        this.hoverId=uuid
      },
      endDragSession(e) {
        if (e.newIndex !== e.oldIndex) {
          let targetSessionId = this.displaySessions[e.newIndex].uuid
          let prevSessionId = targetSessionId // while moving target to bottom
          if (e.newIndex < this.displaySessions.length - 1) { 
            prevSessionId = this.displaySessions[e.newIndex + 1].uuid
          }
          this.bridge.send({
            cmd: 'MoveSession',
            uuids: [targetSessionId, prevSessionId]
          })
        }
      },
      // List animation
      beforeEnter: function (el) {
        el.style.opacity = 0
      },
      enter(el, done) {
        Velocity(
          el,
          { opacity: 1 },
          { complete: done }
        )
      },
      leave(el, done) {
        el.style.display = 'none'
        Velocity(
          el,
          { opacity: 0 },
          { complete: done }
        )
      }
    }
  };
</script>

<style scoped>
  .sessions-list {
    flex: 1;
    min-width: 0;
  }

  .session-placeholder {
    text-align: center;
    margin-top: 60px;
    color: #555555;
    transition: 0.3s;
  }

  @media (prefers-color-scheme: dark) {
    .session-placeholder {
      color: #bdbdbd;
    }
  }
</style>
