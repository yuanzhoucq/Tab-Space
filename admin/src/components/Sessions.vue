<template>
  <div>
    <div v-if="displaySessions.length===0" class="session-placeholder">Nothing here...</div>
    <draggable
        :disabled="sessions.length!==displaySessions.length"
        :list="sessions"
        fallbackTolerance="10"
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
        <session-card v-for="session in displaySessions" :key="session[0]" :session="session"></session-card>
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
    computed: {
      ...mapState(["bridge", "sessions"]),
      ...mapGetters(["displaySessions"]),
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
      endDragSession(e) {
        if (e.newIndex !== e.oldIndex) {
          this.bridge.send({
            cmd: 'SwapSession',
            index: [Number(e.newIndex), Number(e.oldIndex)]
          })
        }
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
      }
    }
  };
</script>

<style scoped>
  .session-placeholder {
    position: absolute;
    left: calc(50vw - 55px);
    top: 150px;
    color: #555555;
    transition: 0.3s;
  }
</style>
