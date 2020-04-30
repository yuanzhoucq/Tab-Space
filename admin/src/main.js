import Vue from 'vue'
import VueRouter from 'vue-router'
import App from './App';
import Admin from './pages/Admin.vue'
import Settings from './pages/Settings.vue'
import feather from 'vue-icon'

import store from './store'
import config from './config'
Vue.config.productionTip = false
Vue.prototype.$myConfig = config

Vue.use(VueRouter)
Vue.use(feather, 'v-icon')

const routes = [
  { path: '/', component: Admin },
  { path: '/settings', component: Settings }
]

const router = new VueRouter({
  routes
})

new Vue({
  store,
  router,
  render: h => h(App),
}).$mount('#app')
