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

.autosuggest ul {
  margin: 5px;
  padding-left: 0;
}

.autosuggest input {
  width: 92px;
  margin: 0 2px;
}

.autosuggest li {
  padding: 3px;
  opacity: 0.9;
  cursor: pointer;
  width: calc(100% - 10px);
  margin-left: -1.8px;
  padding-left: 10px;
  font-size: 12px;
  border-radius: 3px;
}

.autosuggest li:hover {
  background-color: #ddd;
}

.autosuggest .autosuggest__results-container {
  position: absolute;
  width: 100px;
  background-color: #f5f5f5;
  margin-top: 3px;
  border-radius: 4px;
  z-index: 999;
}

#mergeSuggest .autosuggest__results-container {
  width: 12em;
  max-height: 300px;
  overflow-y: scroll;
}

#mergeSuggest input {
  width: 12em;
}


@media (prefers-color-scheme: dark) {
.icon {
  color:#888;
}
.autosuggest .autosuggest__results-container {
  background-color: #555555;
}
.autosuggest li:hover {
  background-color: #777777;
}
}
</style>
