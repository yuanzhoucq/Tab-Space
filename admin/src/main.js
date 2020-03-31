import Vue from 'vue'
import App from './App.vue'

import LangData from './lang.json'

Vue.config.productionTip = false
Vue.prototype.$lang = LangData[navigator.language.toLowerCase() || "en-us"]

new Vue({
  render: h => h(App),
}).$mount('#app')
