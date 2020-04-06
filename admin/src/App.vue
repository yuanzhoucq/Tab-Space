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

<style scoped>

</style>
