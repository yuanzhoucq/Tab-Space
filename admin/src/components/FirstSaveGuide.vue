<template>
  <section class="first-save-guide" data-testid="first-save-guide">
    <div class="first-save-copy">
      <h2>{{lang.noSessions}}</h2>
      <p>{{lang.noSessionsTip}}</p>
    </div>

    <div class="safari-save-demo" role="img" :aria-label="lang.noSessionsTip">
      <div class="safari-titlebar" aria-hidden="true">
        <span class="traffic-light traffic-light-close"></span>
        <span class="traffic-light traffic-light-minimize"></span>
        <span class="traffic-light traffic-light-zoom"></span>
      </div>
      <div class="safari-toolbar" aria-hidden="true">
        <div class="toolbar-button">
          <picture>
            <source media="(prefers-color-scheme: dark)" :srcset="toolbarLightIcon">
            <img :src="toolbarIcon" alt="">
          </picture>
          <span class="guide-step toolbar-step">1</span>
        </div>
        <div class="safari-address">{{dashboardHost}}</div>
      </div>
      <div class="save-menu" aria-hidden="true">
        <div class="save-menu-pointer"></div>
        <div class="save-menu-item save-menu-item-primary">
          <span class="guide-step menu-step">2</span>
          <strong>{{lang.saveAndCloseTabs}}</strong>
          <span class="save-menu-check">&#10003;</span>
        </div>
        <div class="save-menu-item save-menu-item-secondary">
          <span>{{lang.saveAndKeepTabs}}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { mapState } from 'vuex'
import toolbarIcon from '../assets/toolbar-tab-space.png'
import toolbarLightIcon from '../assets/toolbar-tab-space-light.png'

const demoHost = 'example.com'

export default {
  name: 'FirstSaveGuide',
  data() {
    return {
      toolbarIcon,
      toolbarLightIcon,
      dashboardHost: demoHost
    }
  },
  computed: mapState(['lang'])
}
</script>

<style scoped>
.first-save-guide {
  display: grid;
  grid-template-columns: minmax(155px, 0.72fr) minmax(265px, 1.28fr);
  align-items: center;
  gap: 20px;
  min-height: 224px;
  padding: 24px;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 72% 30%, rgba(250, 128, 114, 0.11), transparent 46%),
    rgba(255, 255, 255, 0.72);
  box-shadow: 0 12px 34px rgba(35, 31, 28, 0.08);
  overflow: hidden;
}

.first-save-copy { position: relative; z-index: 1; }

.first-save-copy h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: clamp(22px, 2.4vw, 28px);
  line-height: 1.08;
  letter-spacing: -0.025em;
}

.first-save-copy p {
  margin: 11px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.52;
}

.safari-save-demo {
  position: relative;
  min-height: 180px;
  border: 1px solid rgba(92, 86, 82, 0.22);
  border-radius: 13px;
  background: #f7f7f7;
  box-shadow: 0 10px 24px rgba(45, 39, 35, 0.16);
}

.safari-titlebar {
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

.safari-toolbar {
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

.toolbar-step { position: absolute; top: -11px; left: -10px; z-index: 2; }

.safari-address {
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

.save-menu {
  position: absolute;
  top: 64px;
  left: 16px;
  width: min(225px, calc(100% - 32px));
  padding: 7px;
  box-sizing: border-box;
  border: 1px solid rgba(72, 67, 64, 0.16);
  border-radius: 10px;
  background: rgba(250, 250, 250, 0.96);
  box-shadow: 0 14px 30px rgba(38, 33, 30, 0.24);
  backdrop-filter: blur(18px);
}

.save-menu-pointer {
  position: absolute;
  top: -7px;
  left: 9px;
  width: 12px;
  height: 12px;
  border-top: 1px solid rgba(72, 67, 64, 0.14);
  border-left: 1px solid rgba(72, 67, 64, 0.14);
  background: rgba(250, 250, 250, 0.96);
  transform: rotate(45deg);
}

.save-menu-item {
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

.save-menu-item-primary {
  background: rgba(38, 166, 91, 0.13);
  color: #176d3d;
  animation: menu-highlight 2.1s ease-in-out infinite;
}

.menu-step { position: absolute; right: -12px; top: -10px; }

.save-menu-check {
  color: #1f9b55;
  font-size: 14px;
  font-weight: 800;
  text-align: right;
}

.save-menu-item-secondary { color: #77716e; }

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

@media (max-width: 700px) {
  .first-save-guide { grid-template-columns: 1fr; gap: 24px; padding: 28px 22px; }
  .first-save-copy { text-align: center; }
  .safari-save-demo { width: 100%; max-width: 440px; margin: 0 auto; }
}

@media (prefers-color-scheme: dark) {
  .first-save-guide {
    background:
      radial-gradient(circle at 72% 30%, rgba(250, 128, 114, 0.1), transparent 46%),
      rgba(36, 36, 38, 0.78);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  }
  .safari-save-demo {
    border-color: rgba(255, 255, 255, 0.12);
    background: #252527;
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.38);
  }
  .safari-titlebar {
    border-color: rgba(255, 255, 255, 0.08);
    background: linear-gradient(#39393b, #303032);
  }
  .safari-toolbar {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(48, 48, 50, 0.96);
  }
  .toolbar-button {
    background: rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .safari-address {
    border-color: rgba(255, 255, 255, 0.08);
    background: #242426;
    color: #aaa5a2;
  }
  .save-menu,
  .save-menu-pointer {
    border-color: rgba(255, 255, 255, 0.09);
    background: rgba(52, 52, 54, 0.96);
  }
  .save-menu-item { color: #dfdcda; }
  .save-menu-item-primary { background: rgba(48, 196, 107, 0.18); color: #8de2ad; }
  .save-menu-item-secondary { color: #b5afac; }
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-button::after,
  .save-menu-item-primary { animation: none; }
}
</style>
