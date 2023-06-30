<template>
  <div>
    <div id="main">
      <nav>
        <router-link class="link" to="/">{{lang.back}}</router-link>
      </nav>
      <div id="title">
        <h1>Tab Space {{lang.settings}}</h1>
      </div>
      <div id="settings">
        <div class="setting" v-for="setting in settings" :key="setting">
          <toggle-button
          :value="tabSpaceSettings[setting]==='true'"
          :sync="true"
          @change="(e) => setDefault(e, setting)"
        ></toggle-button><label :id="setting" class="toggle-label">{{lang[setting]}}</label><br>
        </div>
        <hr style="border-width: 0; height: 1px; background-color: #dddddd; margin: 20px 0;" />
        <div>
          <label id="language" style="margin-right: 10px;">Language</label>
          <select name="languages" id="language-select" v-model="tabSpaceSettings[preferredLanguageKey]" @change="setLanguage">
            <option v-for="language in languages" :key="`lang-${language.code}`" :value="language.code">{{language.name}}</option>
          </select>
          <p>
            <a style="color: gray" href="https://joyuer.cn/Tab-Space/translate.html">Help us translate Tab Space</a>
          </p>
        </div>
      </div>
      <div class="tips">
        <hr style="border-width: 0; height: 1px; background-color: #dddddd; margin: 20px 0;" />
        <small>{{lang.goTip}}</small>

        <h3>{{lang.shortcuts}}</h3>
        <p>
          <small>{{lang.shortcutTip}}</small>
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} D</code>
          {{lang.ctrlD}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} L</code>
          {{lang.ctrlL}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} R</code>
          {{lang.ctrlR}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} K</code>
          {{lang.ctrlK}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} Q</code>
          {{lang.ctrlQ}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} ;</code>
          {{lang.saveAndCloseTabs}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} S</code>
          {{lang.saveCurrentTab}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} C</code>
          {{lang.ctrlC}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} W</code>
          {{lang.ctrlW}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} F</code>
          {{lang.ctrlF}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} I</code>
          {{lang.ctrlI}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} T</code>
          {{lang.ctrlT}}
        </p>
        <p>
          <code>Ctrl + {{ tabSpaceSettings["shift-shortcuts"] === "true" ? "Shift +" : "" }} B</code>
          {{lang.ctrlB}}
        </p>

        <hr style="border-width: 0; height: 1px; background-color: #dddddd; margin: 20px 0;" />
        <span class="link" @click="manuallyMigrate" style="cursor: pointer"><small>{{lang.manuallyMigrate}}</small></span> <br/><br/>
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
import { ToggleButton } from 'vue-js-toggle-button'
import { mapState } from 'vuex'
import Constants from '../constants'

export default {
  name: "Settings",
  components: {
    ToggleButton
  },
  data() {
    return {
      ...Constants
    };
  },
  computed: mapState(["lang", "bridge", "tabSpaceSettings"]),
  methods: {
    setDefault(e, setting) {
      const value = e.value ? "true" : "false";
      this.bridge.send({cmd: "SetDefault", name: setting, value})
    },
    setLanguage(e) {
      this.bridge.send({cmd: "SetDefault", name: Constants.preferredLanguageKey, value: e.target.value})
    },
    manuallyMigrate() {
      this.bridge.send({cmd: "ManuallyMigrate"})
      this.$router.replace({path: "/"})
    }
  }
};
</script>

<style scoped>
body {
  background-color: #fbfbfb;
  font-family: "PingFang SC", sans-serif;
}

#main {
  min-height: calc(100vh - 80px);
}

footer {
  display: flex;
  justify-content: center;
}

.footer-sep {
  width: 10px;
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
  max-width: 600px;
  margin: 0 auto;
}

#settings {
  max-width: 600px;
  margin: 0 auto;
}

.tips {
  max-width: 600px;
  margin: 0 auto;
}

code {
  background-color: darkorange;
  padding: 4px;
  border-radius: 3px;
  color: whitesmoke;
}

.setting {
  margin-bottom: 10px;
}

.toggle-label {
  margin-left: 15px;
}

@media (prefers-color-scheme: dark) {
  .link {
    color: #eeeeee;
  }
}
</style>
