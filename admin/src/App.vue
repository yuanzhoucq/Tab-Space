<template>
  <div>
    <router-view></router-view>
    <tab-space-bridge></tab-space-bridge>
    <update-toast></update-toast>
    <split-preview-modal></split-preview-modal>
    <subscription-modal></subscription-modal>
    <suggestion-report-modal></suggestion-report-modal>
    <ai-consent-modal></ai-consent-modal>
    <ai-toast></ai-toast>
    <subscription-refresh-toast></subscription-refresh-toast>
    <whats-new-modal></whats-new-modal>
  </div>
</template>

<script>
  import TabSpaceBridge from './components/TabSpaceBridge'
  import UpdateToast from './components/UpdateToast'
  import SplitPreviewModal from './components/SplitPreviewModal'
  import SubscriptionModal from './components/SubscriptionModal'
  import SuggestionReportModal from './components/SuggestionReportModal'
  import SubscriptionRefreshToast from './components/SubscriptionRefreshToast'
  import WhatsNewModal from './components/WhatsNewModal'
  // Filenames keep the AI prefix; the local binding uses Ai so the kebab-case
  // tag resolves (<ai-consent-modal>, not <a-i-consent-modal>). Same as AIToast.
  import AiConsentModal from './components/AIConsentModal'
  import AiToast from './components/AIToast'

  export default {
    name: "App",
    components: {
      TabSpaceBridge,
      UpdateToast,
      SplitPreviewModal,
      SubscriptionModal,
      SuggestionReportModal,
      SubscriptionRefreshToast,
      WhatsNewModal,
      AiConsentModal,
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
}
</style>
