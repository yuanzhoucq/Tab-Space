import './assets/css/main.css'
import Vue from 'vue'
import VueRouter from 'vue-router'
import App from './App';
import Admin from './pages/Admin.vue'
import Settings from './pages/Settings.vue'
import feather from 'vue-icon'

import store from './store'
import buildInfo from './build-info'
import { installAIWorkerWarmup } from './ai-warmup'
import { markPerf } from './perf-debug'
Vue.config.productionTip = false

markPerf('main-evaluated')

Vue.use(VueRouter)
Vue.use(feather, 'v-icon')

const routes = [
  { path: '/', component: Admin },
  { path: '/settings', component: Settings }
]

const router = new VueRouter({
  routes
})

if (process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).has('mock')) {
  require('./dev-mock-bridge').installMockBridge()
}

new Vue({
  store,
  router,
  render: h => h(App),
}).$mount('#app')

markPerf('vue-mounted', {
  domNodes: document.getElementsByTagName('*').length
})

if (window.__tabspace_bridge && typeof window.__tabspace_bridge.markReady === 'function') {
  window.__tabspace_bridge.markReady()
}
window.dispatchEvent(new CustomEvent('tabspace:dashboard-ready'))
installAIWorkerWarmup()

console.log(`Tab Space dashboard build ${buildInfo.shortSha}${buildInfo.time ? ` (${buildInfo.time})` : ''}`)

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  let updatePromptShown = false
  const promptForDashboardUpdate = () => {
    if (updatePromptShown) return
    updatePromptShown = true
    window.dispatchEvent(new CustomEvent('tabspace:sw-update-ready'))
  }

  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'TABSPACE_APP_UPDATE_READY') {
      promptForDashboardUpdate()
    }
  })

  window.addEventListener('load', () => {
    markPerf('window-loaded', {
      controlled: Boolean(navigator.serviceWorker.controller)
    })
    navigator.serviceWorker.register(`${process.env.BASE_URL}service-worker.js`)
      .then(registration => {
        markPerf('service-worker-registered', {
          controlled: Boolean(navigator.serviceWorker.controller),
          active: registration.active ? registration.active.state : 'none'
        })
        // The service worker itself announces TABSPACE_APP_UPDATE_READY only
        // after it has verified that the new shell's assets are reachable.
        registration.update().catch(() => {})
      })
      .catch(error => {
        console.log('Service worker registration failed:', error)
      })
  })
}
