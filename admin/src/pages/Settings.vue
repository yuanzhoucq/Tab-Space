<template>
  <div class="settings-page">
    <div class="container">
      <nav class="nav-header">
        <router-link class="back-link" to="/">
          <v-icon name="arrow-left" class="back-icon"></v-icon>
          {{lang.back}}
        </router-link>
      </nav>
      
      <header class="page-header">
        <h1>Tab Space {{lang.settings}}</h1>
      </header>

      <div class="settings-content">
        <!-- General Preferences -->
        <div class="card">
          <h2 class="section-title">{{lang.generalPreferences}}</h2>
          <div class="setting-list">
            <div class="setting-item" v-for="setting in settings" :key="setting">
              <label :for="setting" class="setting-label">{{lang[setting]}}</label>
              <toggle-button 
                :id="setting"
                :value="tabSpaceSettings[setting]==='true'"
                :sync="true"
                :color="{checked: '#00b51d', unchecked: '#ccc'}"
                @change="(e) => setDefault(e, setting)"
              />
            </div>
          </div>
        </div>

        <!-- Localization -->
        <div class="card">
          <h2 class="section-title">{{lang.localization}}</h2>
          <div class="form-group">
            <label for="language-select" class="form-label">{{lang.language}}</label>
            <div class="custom-select-wrapper">
              <select name="languages" id="language-select" class="custom-select" v-model="tabSpaceSettings[preferredLanguageKey]" @change="setLanguage">
                <option v-for="language in languages" :key="`lang-${language.code}`" :value="language.code">{{language.name}}</option>
              </select>
              <v-icon name="chevron-down" class="select-arrow-icon"></v-icon>
            </div>
            <p class="help-text">
              <a href="https://mytab.space/translate.html" target="_blank">{{lang.helpTranslate}}</a>
            </p>
          </div>
        </div>

        <!-- Shortcuts -->
        <div class="card">
          <h2 class="section-title">{{lang.shortcuts}}</h2>
          <p class="text-muted text-sm mb-4">{{lang.shortcutTip}}</p>
          
          <div class="shortcuts-grid">
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>D</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlD}}</div>
            </div>
            
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>L</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlL}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>R</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlR}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>K</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlK}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>Q</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlQ}}</div>
            </div>
            
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>;</kbd>
              </div>
              <div class="shortcut-desc">{{lang.saveAndCloseTabs}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>S</kbd>
              </div>
              <div class="shortcut-desc">{{lang.saveCurrentTab}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>T</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlT}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>B</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlB}}</div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>M</kbd>
              </div>
              <div class="shortcut-desc">{{lang.ctrlM}}</div>
            </div>

            <!-- External Browser Shortcuts -->
            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>C</kbd>
              </div>
              <div class="shortcut-desc">
                 {{lang.openIn}} 
                 <div class="custom-select-wrapper inline-select-wrapper">
                   <select class="custom-select inline-select" v-model="tabSpaceSettings[externalBrowser1Key]" @change="(e) => setExternalBrowser(1, e)">
                      <option v-for="browser in browsers" :key="`b1-${browser}`" :value="browser">{{browser}}</option>
                   </select>
                   <v-icon name="chevron-down" class="select-arrow-icon inline"></v-icon>
                 </div>
              </div>
            </div>

            <div class="shortcut-item">
              <div class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="key-sep">+</span><template v-if="tabSpaceSettings['shift-shortcuts'] === 'true'"><kbd>Shift</kbd><span class="key-sep">+</span></template><kbd>F</kbd>
              </div>
              <div class="shortcut-desc">
                 {{lang.openIn}} 
                 <div class="custom-select-wrapper inline-select-wrapper">
                   <select class="custom-select inline-select" v-model="tabSpaceSettings[externalBrowser2Key]" @change="(e) => setExternalBrowser(2, e)">
                      <option v-for="browser in browsers" :key="`b2-${browser}`" :value="browser">{{browser}}</option>
                   </select>
                   <v-icon name="chevron-down" class="select-arrow-icon inline"></v-icon>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer class="page-footer">
        <a class="footer-link" href="mailto:joyuercn@icloud.com">{{lang.contact}}</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://twitter.com/joyuer/status/1164816334305157120" target="_blank">Twitter</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://mytab.space" target="_blank">{{lang.about}}</a>
        <span class="footer-sep">·</span>
        <a class="footer-link" href="https://joyuer.notion.site/Tab-Space-FAQ-6d9383b54d704f6d85d404be96c31dd5" target="_blank">FAQ</a>
        <p class="build-info">
          <a v-if="buildInfo.commitUrl" :href="buildInfo.commitUrl" target="_blank" rel="noopener">Build {{buildInfo.shortSha}}{{buildInfo.time ? ` · ${buildInfo.time}` : ''}}</a>
          <span v-else>Build {{buildInfo.shortSha}}</span>
        </p>
      </footer>
    </div>
  </div>
</template>

<script>
import { ToggleButton } from 'vue-js-toggle-button'
import { mapState } from 'vuex'
import Constants from '../constants'
import buildInfo from '../build-info'

export default {
  name: "Settings",
  components: {
    ToggleButton
  },
  data() {
    return {
      ...Constants,
      buildInfo
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
    setExternalBrowser(number, e) {
      let key = number == 1 ? Constants.externalBrowser1Key : Constants.externalBrowser2Key
      this.bridge.send({cmd: "SetDefault", name: key, value: e.target.value})
    }
  }
};
</script>

<style scoped>
.settings-page {
  padding: 24px 20px;
  min-height: 100vh;
}

.container {
  max-width: 700px;
  margin: 0 auto;
}

.nav-header {
  margin-bottom: 16px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.back-link:hover {
  background-color: rgba(0, 0, 0, 0.06);
}

.back-icon {
  margin-right: 6px;
  width: 18px;
  height: 18px;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 24px;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.setting-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
}

.setting-label {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-primary);
}

/* Custom Select Styles */
.custom-select-wrapper {
  position: relative;
  display: inline-block;
  width: 100%;
  max-width: 240px;
}

.custom-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 100%;
  padding: 8px 32px 8px 12px;
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

.custom-select:hover {
  border-color: var(--primary-color);
  background-color: var(--card-bg);
}

.custom-select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(0, 181, 29, 0.15);
}

.select-arrow-icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text-secondary);
  width: 14px;
  height: 14px;
}

.select-arrow-icon.inline {
  right: 6px;
  width: 12px;
  height: 12px;
}

/* Inline select for shortcuts */
.inline-select-wrapper {
  width: auto;
  max-width: none;
  display: inline-flex;
  vertical-align: middle;
}

.inline-select {
  padding: 4px 24px 4px 8px;
  font-size: 0.8rem;
  min-width: 90px;
}

.help-text {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.help-text a {
  color: var(--text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.help-text a:hover {
  color: var(--primary-color);
}

.text-muted {
  color: var(--text-secondary);
}

.text-sm {
  font-size: 0.8rem;
}

.mb-4 {
  margin-bottom: 0.75rem;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.shortcut-item {
  padding: 10px 12px;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
  font-size: 0.8em;
  justify-content: flex-start;
}

.key-sep {
  margin: 0 3px;
  color: var(--text-secondary);
  opacity: 0.6;
}

.shortcut-desc {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
  text-align: left;
  margin-left: 5px;
}

.page-footer {
  margin-top: 40px;
  text-align: center;
  color: var(--text-secondary);
  padding-bottom: 24px;
  font-size: 0.85rem;
  flex-wrap: wrap;
}

.footer-link {
  color: var(--text-secondary);
  margin: 0 4px;
}

.footer-link:hover {
  color: var(--primary-color);
}

.footer-sep {
  margin: 0 6px;
  opacity: 0.5;
}

.build-info {
  flex-basis: 100%;
  margin-top: 8px;
  font-size: 0.75rem;
  opacity: 0.7;
}

.build-info a,
.build-info span {
  color: var(--text-secondary);
}

.build-info a:hover {
  color: var(--primary-color);
}

@media (max-width: 600px) {
  .shortcuts-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .back-link:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
}
</style>
