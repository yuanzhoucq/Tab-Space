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
          <code>Ctrl + L</code>
          {{lang.ctrlL}}
        </p>
        <p>
          <code>Ctrl + R</code>
          {{lang.ctrlR}}
        </p>
        <p>
          <code>Ctrl + Q</code>
          {{lang.ctrlQ}}
        </p>
        <p>
          <code>Ctrl + C</code>
          {{lang.ctrlC}}
        </p>
        <p>
          <code>Ctrl + F</code>
          {{lang.ctrlF}}
        </p>
        <p>
          <code>Ctrl + I</code>
          {{lang.ctrlI}}
          <br />
          <br />
          <small>{{lang.braveTip}}</small>
        </p>
        <p>
          <code>Ctrl + T</code>
          {{lang.ctrlT}}
        </p>
        <p>
          <code>Ctrl + B</code>
          {{lang.ctrlB}}
          <br />
          <br />
          <small>
            {{lang.bearTip}}
            <a :href="lang.bearUrl" target="_blank">Bear</a>
          </small>
        </p>
      </div>
    </div>
    <footer>
      <a class="link" href="mailto:joyuercn@icloud.com">{{lang.contact}}</a>
      <span class="footer-sep"></span>
      <a class="link" href="http://joyuer.cn/Tab-Space" target="_blank">{{lang.about}}</a>
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
  mounted() {
    this.checkDefaults()
  },
  methods: {
    setDefault(e, setting) {
      const value = e.value ? "true" : "false";
      this.bridge.send({cmd: "SetDefault", name: setting, value})
    },
    setLanguage(e) {
      this.bridge.send({cmd: "SetDefault", name: Constants.preferredLanguageKey, value: e.target.value})
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
</style>
