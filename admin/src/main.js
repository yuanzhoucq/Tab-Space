import './assets/css/main.css'
import Vue from 'vue'
import VueRouter from 'vue-router'
import App from './App';
import Admin from './pages/Admin.vue'
import Settings from './pages/Settings.vue'
import feather from 'vue-icon'

import store from './store'
import buildInfo from './build-info'
Vue.config.productionTip = false

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

if (window.__tabspace_bridge && typeof window.__tabspace_bridge.markReady === 'function') {
  window.__tabspace_bridge.markReady()
}
window.dispatchEvent(new CustomEvent('tabspace:dashboard-ready'))

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
    navigator.serviceWorker.register(`${process.env.BASE_URL}service-worker.js`).then(registration => {
      registration.update().catch(() => {})
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            promptForDashboardUpdate()
          }
        })
      })
    }).catch(error => {
      console.log('Service worker registration failed:', error)
    })
  })
}
