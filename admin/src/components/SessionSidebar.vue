<template>
  <div class="session-sidebar">
    <div
      class="tag-filter"
      :class="{'active-tag': activeTag===''}"
      @click="setActiveTag('')"
    >
      <b>{{ lang.all }}</b>
    </div>
    <div
      class="tag-filter upper-border"
      v-for="tag in tags"
      :key="tag"
      :class="{'active-tag': activeTag===tag}"
      @click="setActiveTag(tag)"
    >{{tag}}</div>
    <div class="tips">{{ lang.cloudTips }}</div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  name: "SessionSidebar",
  computed: {
    ...mapState(["lang", "activeTag"]),
    ...mapGetters(["tags"])
  },
  methods: {
    setActiveTag(tag) {
      this.$store.commit("setActiveTag", tag)
    }
  }
};
</script>

<style scoped>
.session-sidebar {
  width: 100px;
  margin-right: 25px;
  display: flex;
  flex-direction: column;
  transition: 0.2s;
}

.tag-filter {
  background-color: white;
  padding: 5px;
  padding-left: 10px;
  border-radius: 5px;
  cursor: pointer;
}

.tag-filter:hover {
  background-color: lightsalmon;
  border-width: 0;
  transition: 0.15s;
  margin-right: -5px;
  color: whitesmoke;
}

.active-tag {
  background-color: salmon;
  color: white !important;
  transition: 0.1s;
  font-weight: bold;
  margin-right: -10px;
}

.tips {
  margin-top: 20px;
  font-size: 12px;
  color: #aaaaaa;
}

@media (prefers-color-scheme: dark) {
  .tag-filter {
    background-color: #252525;
    color: #d0d0d0;
  }

  .tag-filter:hover {
    color: #eeeeee;
    background-color: rgba(255, 160, 122, 0.705);
  }

  .active-tag {
    background-color: rgba(250, 128, 114, 0.719);
  }

  .upper-border {
    border-top: 1px solid #eeeeee;
  }
}
</style>
