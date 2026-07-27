<template>
  <div v-if="aiEnabled && topSuggestion" class="ai-dashboard-card" data-testid="ai-suggestion-card">
    <!-- Persistent quota/plan status lives in the navbar and Settings; this
         card stays purely about suggestions so there is only one upsell path. -->

    <!-- Top-ranked suggestion (at most one shown at a time — design §3.2) -->
    <div v-if="topSuggestion" class="suggestion" data-testid="top-suggestion">
      <div class="suggestion-icon" aria-hidden="true">
        <v-icon :name="iconFor(topSuggestion.type)"></v-icon>
      </div>
      <div class="suggestion-body">
        <div class="suggestion-title">{{ titleFor(topSuggestion) }}</div>
        <div class="suggestion-desc">{{ descFor(topSuggestion) }}</div>
      </div>
      <div class="suggestion-actions">
        <button type="button" class="suggestion-review" @click="review(topSuggestion)">
          {{ lang.suggestionReview || 'Review' }}
        </button>
        <button type="button" class="suggestion-primary" @click="apply(topSuggestion)">
          <span v-if="requiresPremium(topSuggestion) && !isPremium" class="premium-star" aria-hidden="true">⭐</span>
          {{ primaryLabelFor(topSuggestion) }}
        </button>
      </div>
      <div class="suggestion-controls">
        <button type="button" class="icon-btn" :title="lang.suggestionMuteType || 'Don\'t show this type again'"
                :aria-label="lang.suggestionMuteType || 'Don\'t show this type again'" @click="mute(topSuggestion)">
          <v-icon name="bell-off"></v-icon>
        </button>
        <button type="button" class="icon-btn" :title="lang.suggestionDismiss || 'Dismiss'"
                :aria-label="lang.suggestionDismiss || 'Dismiss'" data-testid="dismiss-suggestion" @click="dismiss(topSuggestion)">
          <v-icon name="x"></v-icon>
        </button>
      </div>
    </div>

    <div v-if="suggestions.length" class="view-all-row">
      <button type="button" class="view-all" data-testid="view-all-suggestions" @click="openReport">
        {{ viewAllLabel }}
      </button>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import { suggestionMixin } from '../suggestions'

export default {
  name: 'SuggestionCard',
  mixins: [suggestionMixin],
  computed: {
    ...mapState(['lang', 'suggestions']),
    ...mapGetters(['aiEnabled', 'isPremium', 'topSuggestion']),
    viewAllLabel() {
      const template = this.lang.suggestionViewAll || 'View all {count} suggestions'
      return template.replace('{count}', this.suggestions.length)
    }
  },
  methods: {
    openReport() {
      this.$store.commit('setShowSuggestionReport', true)
    }
  }
}
</script>

<style scoped>
.ai-dashboard-card {
  width: 100%;
  max-width: 840px;
  margin: 4px auto 14px;
  padding: 0 16px;
  box-sizing: border-box;
}

.suggestion {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-left: 3px solid var(--primary-color, #eb5205);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
}

.suggestion-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(235, 82, 5, 0.1);
  color: var(--primary-color, #eb5205);
}

.suggestion-icon svg {
  width: 17px;
  height: 17px;
  stroke: var(--primary-color, #eb5205) !important;
}

.suggestion-body {
  flex: 1;
  min-width: 0;
}

.suggestion-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #2d3748);
}

.suggestion-desc {
  font-size: 12.5px;
  color: var(--text-secondary, #718096);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.suggestion-review {
  background: transparent;
  border: 1px solid var(--border-color, #e2e8f0);
  color: var(--text-primary, #2d3748);
  border-radius: 7px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}

.suggestion-review:hover {
  background: var(--bg-color, #f8f6f2);
}

.suggestion-primary {
  background: var(--primary-color, #eb5205);
  border: none;
  color: #ffffff;
  border-radius: 7px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.premium-star {
  margin-right: 3px;
}

.suggestion-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  background: transparent;
  color: var(--text-secondary, #718096);
  border-radius: 6px;
  cursor: pointer;
}

.icon-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary, #2d3748);
}

.icon-btn svg {
  width: 15px;
  height: 15px;
}

.view-all-row {
  margin-top: 8px;
  text-align: center;
}

.view-all {
  background: none;
  border: 0;
  font: inherit;
  font-size: 13px;
  color: var(--primary-color, #eb5205);
  cursor: pointer;
}

.view-all:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .suggestion {
    flex-wrap: wrap;
  }

  .suggestion-body {
    flex-basis: 100%;
    order: 1;
  }
}

@media (prefers-color-scheme: dark) {
  .suggestion {
    background: var(--card-bg, #2a2a2a);
    border-color: #3a3a3a;
    border-left-color: var(--primary-color, #eb5205);
  }

  .suggestion-review {
    color: #e6e6e6;
    border-color: #3a3a3a;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f7fafc;
  }
}
</style>
