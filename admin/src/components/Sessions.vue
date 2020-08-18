<template>
  <div>
    <div v-if="displaySessions.length===0" class="session-placeholder">Nothing here...</div>
    <draggable
        :disabled="sessions.length !== displaySessions.length"
        handle=".handle"
        :list="displaySessions"
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
      ...mapState(["bridge", "sessions", "activeTag"]),
      ...mapGetters(["displaySessions"]),
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
          let targetSession = e.target.children[e.newIndex]
          let targetSessionId = targetSession.id;
          let prevSessionId;
          if (e.newIndex == e.target.children.length - 1) { prevSessionId = targetSessionId }
          else { prevSessionId = e.target.children[e.newIndex + 1].id;}
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
  .session-placeholder {
    position: absolute;
    left: calc(50vw - 55px);
    top: 180px;
    color: #555555;
    transition: 0.3s;
  }
</style>
