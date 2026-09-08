<template>
  <section class="connection-guide"
           :class="safari ? 'guide-safari' : 'guide-pairing'"
           :data-testid="safari ? 'safari-permission-guide' : 'pairing-guide'">
    <div class="guide-copy">
      <h2>{{safari ? lang.connectSafariTitle : lang.connectPairTitle}}</h2>
      <p class="guide-lede">{{safari ? lang.connectSafariLede : lang.connectPairLede}}</p>
      <ol class="guide-steps">
        <li v-for="(step, index) in steps" :key="index">
          <span class="guide-step">{{index + 1}}</span>
          <span>{{step}}</span>
        </li>
      </ol>
    </div>

    <!-- Safari: the toolbar button and the permission popover it opens. -->
    <div v-if="safari" class="browser-mock" role="img" :aria-label="lang.connectSafariStep2">
      <div class="mock-titlebar" aria-hidden="true">
        <span class="traffic-light traffic-light-close"></span>
        <span class="traffic-light traffic-light-minimize"></span>
        <span class="traffic-light traffic-light-zoom"></span>
      </div>
      <div class="mock-toolbar" aria-hidden="true">
        <div class="toolbar-button">
          <picture>
            <source media="(prefers-color-scheme: dark)" :srcset="toolbarLightIcon">
            <img :src="toolbarIcon" alt="">
          </picture>
          <span class="guide-step toolbar-step">1</span>
        </div>
        <div class="mock-address">{{dashboardHost}}</div>
      </div>
      <div class="mock-menu" aria-hidden="true">
        <div class="mock-menu-pointer"></div>
        <div class="mock-menu-item mock-menu-item-primary">
          <span class="guide-step menu-step">2</span>
          <strong>{{lang.connectAllowAlways}}</strong>
          <span class="mock-menu-check">&#10003;</span>
        </div>
        <div class="mock-menu-item mock-menu-item-secondary">
          <span>{{lang.connectAllowOnce}}</span>
        </div>
      </div>
    </div>

    <!-- Other browsers: the extension popup asking for the app's pairing code. -->
    <div v-else class="browser-mock" role="img" :aria-label="lang.connectPairStep3">
      <div class="mock-titlebar" aria-hidden="true">
        <span class="traffic-light traffic-light-close"></span>
        <span class="traffic-light traffic-light-minimize"></span>
        <span class="traffic-light traffic-light-zoom"></span>
      </div>
      <div class="mock-toolbar" aria-hidden="true">
        <div class="mock-address">{{dashboardHost}}</div>
        <div class="toolbar-button">
          <picture>
            <source media="(prefers-color-scheme: dark)" :srcset="toolbarLightIcon">
            <img :src="toolbarIcon" alt="">
          </picture>
        </div>
      </div>
      <div class="mock-popup" aria-hidden="true">
        <div class="mock-popup-pointer"></div>
        <p class="mock-popup-label">{{lang.connectPairCodeLabel}}</p>
        <div class="pair-code">
          <span v-for="(digit, index) in pairingCode" :key="index" class="pair-digit">{{digit}}</span>
        </div>
        <div class="mock-popup-button">{{lang.connectPairConnect}}</div>
      </div>
    </div>

    <div class="guide-notes">
      <div class="guide-note">
        <h3>{{safari ? lang.connectSafariWhyTitle : lang.connectPairWhyTitle}}</h3>
        <p>{{safari ? lang.connectSafariWhy : lang.connectPairWhy}}</p>
      </div>
      <div class="guide-note">
        <h3>{{lang.connectPrivacyTitle}}</h3>
        <p>{{safari ? lang.connectSafariPrivacy : lang.connectPairPrivacy}}</p>
      </div>
    </div>

    <div class="guide-actions">
      <button class="primary-button" type="button" @click="$emit('retry')">{{lang.retry}}</button>
      <a v-if="!safari"
         class="secondary-button"
         href="https://mytab.space/multi-browser.html"
         target="_blank"
         rel="noopener noreferrer">{{lang.multiBrowserGuide}}</a>
      <a class="secondary-button"
         href="https://mytab.space"
         target="_blank"
         rel="noopener noreferrer">{{lang.getTabSpace}}</a>
    </div>
    <p class="guide-footnote">{{lang.connectMissingExtension}}</p>
  </section>
</template>

<script>
import { mapState } from 'vuex'
import { isSafari } from '../device'
import toolbarIcon from '../assets/toolbar-tab-space.png'
import toolbarLightIcon from '../assets/toolbar-tab-space-light.png'

// A stand-in for the six digits the Mac app shows, not a real code.
const samplePairingCode = '482915'

export default {
  name: 'ConnectionGuide',
  data() {
    return {
      toolbarIcon,
      toolbarLightIcon,
      safari: isSafari(),
      pairingCode: samplePairingCode.split(''),
      dashboardHost: 'app.mytab.space'
    }
  },
  computed: {
    ...mapState(['lang']),
    steps() {
      return this.safari
        ? [this.lang.connectSafariStep1, this.lang.connectSafariStep2]
        : [this.lang.connectPairStep1, this.lang.connectPairStep2, this.lang.connectPairStep3]
    }
  }
}
</script>

<style scoped>
.connection-guide {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(280px, 1fr);
  align-items: center;
  gap: 22px 26px;
  max-width: 780px;
  margin: 72px auto 0;
  padding: 28px;
  box-sizing: border-box;
  text-align: left;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 78% 22%, rgba(250, 128, 114, 0.12), transparent 48%),
    rgba(255, 255, 255, 0.72);
  box-shadow: 0 12px 34px rgba(35, 31, 28, 0.08);
}

.guide-copy h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: clamp(21px, 2.3vw, 26px);
  line-height: 1.14;
  letter-spacing: -0.02em;
}

.guide-lede {
  margin: 11px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.guide-steps {
  margin: 16px 0 0;
  padding: 0;
  display: grid;
  gap: 9px;
}

.guide-steps li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  margin: 0;
  padding: 0;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
  background: none;
  border-radius: 0;
}

.guide-steps li:hover { background: none; }

.guide-step {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #24a75c;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 2px 7px rgba(22, 113, 62, 0.28);
}

/* Browser chrome, shared by both variants. */
.browser-mock {
  position: relative;
  min-height: 200px;
  border: 1px solid rgba(92, 86, 82, 0.22);
  border-radius: 13px;
  background: #f7f7f7;
  box-shadow: 0 10px 24px rgba(45, 39, 35, 0.16);
}

.mock-titlebar {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border-bottom: 1px solid rgba(92, 86, 82, 0.18);
  border-radius: 13px 13px 0 0;
  background: linear-gradient(#f4f4f4, #e9e9e9);
}

.traffic-light { width: 9px; height: 9px; border-radius: 50%; }
.traffic-light-close { background: #ff5f57; }
.traffic-light-minimize { background: #febc2e; }
.traffic-light-zoom { background: #28c840; }

.mock-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(92, 86, 82, 0.16);
  background: rgba(244, 244, 244, 0.92);
}

.toolbar-button {
  position: relative;
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  flex: 0 0 31px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: inset 0 0 0 1px rgba(60, 55, 52, 0.12);
}

.toolbar-button::after {
  content: '';
  position: absolute;
  inset: -5px;
  border: 2px solid rgba(38, 166, 91, 0.72);
  border-radius: 11px;
  animation: toolbar-pulse 2.1s ease-out infinite;
}

.toolbar-button img { display: block; width: 19px; height: 19px; object-fit: contain; }

.toolbar-step { position: absolute; top: -11px; left: -10px; z-index: 2; }

.mock-address {
  flex: 1;
  min-width: 0;
  padding: 7px 15px;
  overflow: hidden;
  border: 1px solid rgba(92, 86, 82, 0.12);
  border-radius: 8px;
  background: #ffffff;
  color: #77716e;
  font-size: 11px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mock-menu,
.mock-popup {
  position: absolute;
  top: 64px;
  width: min(232px, calc(100% - 32px));
  padding: 7px;
  box-sizing: border-box;
  border: 1px solid rgba(72, 67, 64, 0.16);
  border-radius: 10px;
  background: rgba(250, 250, 250, 0.96);
  box-shadow: 0 14px 30px rgba(38, 33, 30, 0.24);
  backdrop-filter: blur(18px);
}

.mock-menu { left: 16px; }
.mock-popup { right: 14px; padding: 13px; }

/* The pairing popup is the taller of the two, so its window grows to hold it. */
.guide-pairing .browser-mock { min-height: 232px; }

.mock-menu-pointer,
.mock-popup-pointer {
  position: absolute;
  top: -7px;
  width: 12px;
  height: 12px;
  border-top: 1px solid rgba(72, 67, 64, 0.14);
  border-left: 1px solid rgba(72, 67, 64, 0.14);
  background: rgba(250, 250, 250, 0.96);
  transform: rotate(45deg);
}

.mock-menu-pointer { left: 9px; }
.mock-popup-pointer { right: 12px; }

.mock-menu-item {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  min-height: 35px;
  padding: 5px 8px;
  box-sizing: border-box;
  border-radius: 7px;
  color: #4d4946;
  font-size: 12px;
}

.mock-menu-item-primary {
  background: rgba(38, 166, 91, 0.13);
  color: #176d3d;
  animation: menu-highlight 2.1s ease-in-out infinite;
}

.menu-step { position: absolute; right: -12px; top: -10px; }

.mock-menu-check {
  color: #1f9b55;
  font-size: 14px;
  font-weight: 800;
  text-align: right;
}

.mock-menu-item-secondary { color: #77716e; }

.mock-popup-label {
  margin: 0 0 9px;
  color: #77716e;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pair-code {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 5px;
}

.pair-digit {
  display: grid;
  place-items: center;
  height: 30px;
  border: 1px solid rgba(72, 67, 64, 0.18);
  border-radius: 6px;
  background: #ffffff;
  color: #3f3b39;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.pair-digit:last-child {
  border-color: rgba(38, 166, 91, 0.55);
  animation: caret-blink 1.6s ease-in-out infinite;
}

.mock-popup-button {
  margin-top: 11px;
  padding: 7px 0;
  border-radius: 7px;
  background: #24a75c;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.guide-notes {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 8px 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border-color);
}

.guide-note h3 {
  margin: 0 0 5px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.guide-note p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.55;
}

.guide-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin: 0;
}

.guide-footnote {
  grid-column: 1 / -1;
  margin: -6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

@keyframes toolbar-pulse {
  0%, 42% { opacity: 0; transform: scale(0.8); }
  58% { opacity: 1; }
  82%, 100% { opacity: 0; transform: scale(1.16); }
}

@keyframes menu-highlight {
  0%, 34% { box-shadow: inset 0 0 0 1px rgba(38, 166, 91, 0); }
  52%, 80% { box-shadow: inset 0 0 0 1px rgba(38, 166, 91, 0.38); }
  100% { box-shadow: inset 0 0 0 1px rgba(38, 166, 91, 0); }
}

@keyframes caret-blink {
  0%, 45% { box-shadow: 0 0 0 2px rgba(38, 166, 91, 0.16); }
  70%, 100% { box-shadow: 0 0 0 2px rgba(38, 166, 91, 0); }
}

@media (max-width: 700px) {
  .connection-guide {
    grid-template-columns: 1fr;
    margin-top: 40px;
    padding: 24px 20px;
  }
  .guide-copy { text-align: left; }
  .browser-mock { width: 100%; max-width: 440px; margin: 0 auto; }
}

@media (prefers-color-scheme: dark) {
  .connection-guide {
    background:
      radial-gradient(circle at 78% 22%, rgba(250, 128, 114, 0.1), transparent 48%),
      rgba(36, 36, 38, 0.78);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  }
  .browser-mock {
    border-color: rgba(255, 255, 255, 0.12);
    background: #252527;
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.38);
  }
  .mock-titlebar {
    border-color: rgba(255, 255, 255, 0.08);
    background: linear-gradient(#39393b, #303032);
  }
  .mock-toolbar {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(48, 48, 50, 0.96);
  }
  .toolbar-button {
    background: rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .mock-address {
    border-color: rgba(255, 255, 255, 0.08);
    background: #242426;
    color: #aaa5a2;
  }
  .mock-menu,
  .mock-popup,
  .mock-menu-pointer,
  .mock-popup-pointer {
    border-color: rgba(255, 255, 255, 0.09);
    background: rgba(52, 52, 54, 0.96);
  }
  .mock-menu-item { color: #dfdcda; }
  .mock-menu-item-primary { background: rgba(48, 196, 107, 0.18); color: #8de2ad; }
  .mock-menu-item-secondary { color: #b5afac; }
  .mock-popup-label { color: #b5afac; }
  .pair-digit {
    border-color: rgba(255, 255, 255, 0.14);
    background: #2c2c2e;
    color: #e6e3e1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-button::after,
  .mock-menu-item-primary,
  .pair-digit:last-child { animation: none; }
}
</style>
