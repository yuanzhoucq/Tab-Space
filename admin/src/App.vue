<template>
  <div>
    <router-view></router-view>
    <tab-space-bridge></tab-space-bridge>
  </div>
</template>

<script>
  import TabSpaceBridge from './components/TabSpaceBridge'

  export default {
    name: "App",
    components: {
      TabSpaceBridge
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
