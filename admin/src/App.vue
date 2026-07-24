<template>
  <div>
    <router-view></router-view>
    <tab-space-bridge></tab-space-bridge>
    <update-toast></update-toast>
  </div>
</template>

<script>
  import TabSpaceBridge from './components/TabSpaceBridge'
  import UpdateToast from './components/UpdateToast'

  export default {
    name: "App",
    components: {
      TabSpaceBridge,
      UpdateToast
    }
  }
</script>

<style>
.icon {
  color:#666;
  width: 18px;
}
.icon-filled {
  fill: salmon
}

@media (prefers-color-scheme: dark) {
  .icon {
    color:#888;
  }
}
</style>
