import Vue from 'vue'
import App from './Admin.vue'
import store from './store'
import config from './config'
Vue.config.productionTip = false
Vue.prototype.$myConfig = config

new Vue({
  store,
  render: h => h(App),
}).$mount('#app')
