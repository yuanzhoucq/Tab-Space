<template>
  <div>
    <router-view></router-view>
    <tab-space-bridge></tab-space-bridge>
    <update-toast></update-toast>
    <split-preview-modal></split-preview-modal>
    <subscription-modal></subscription-modal>
    <suggestion-report-modal></suggestion-report-modal>
    <ai-toast></ai-toast>
  </div>
</template>

<script>
  import TabSpaceBridge from './components/TabSpaceBridge'
  import UpdateToast from './components/UpdateToast'
  import SplitPreviewModal from './components/SplitPreviewModal'
  import SubscriptionModal from './components/SubscriptionModal'
  import SuggestionReportModal from './components/SuggestionReportModal'
  import AiToast from './components/AIToast'

  export default {
    name: "App",
    components: {
      TabSpaceBridge,
      UpdateToast,
      SplitPreviewModal,
      SubscriptionModal,
      SuggestionReportModal,
      AiToast
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


/* Flash applied to a session card when "Review" is used on a suggestion. */
.suggestion-highlight {
  animation: suggestion-highlight-pulse 2.4s ease-out;
}

@keyframes suggestion-highlight-pulse {
  0% { box-shadow: 0 0 0 0 rgba(235, 82, 5, 0.5); }
  30% { box-shadow: 0 0 0 4px rgba(235, 82, 5, 0.35); }
  100% { box-shadow: 0 0 0 0 rgba(235, 82, 5, 0); }
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
