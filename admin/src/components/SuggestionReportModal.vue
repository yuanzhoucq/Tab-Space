<template>
  <div v-if="showSuggestionReport" class="report-overlay" @click.self="close">
    <div class="report-modal" role="dialog" aria-modal="true">
      <header class="report-header">
        <h2>{{ lang.suggestionReportTitle || 'Cleanup report' }}</h2>
        <button type="button" class="report-close" :aria-label="lang.cancel || 'Close'" @click="close">
          <v-icon name="x"></v-icon>
        </button>
      </header>

      <div class="report-body">
        <p v-if="suggestions.length === 0" class="report-empty">
          {{ lang.suggestionReportEmpty || 'No suggestions right now. Your library looks tidy!' }}
        </p>

        <section v-for="group in groups" :key="group.type" class="report-group">
          <div class="group-head">
            <div class="group-title">
              <v-icon :name="iconFor(group.type)" class="group-icon"></v-icon>
              {{ groupTitle(group) }}
              <span class="group-count">{{ groupCountLabel(group) }}</span>
            </div>
            <button v-if="canBatch(group.type)" type="button" class="apply-all" @click="applyAll(group)">
              <span v-if="!isPremium" class="premium-star" aria-hidden="true">⭐</span>
              {{ applyAllLabel(group) }}
            </button>
          </div>

          <ul class="group-items">
            <li v-for="s in group.items" :key="s.id" class="report-item">
              <div class="report-item-desc">{{ descFor(s) }}</div>
              <div class="report-item-actions">
                <button type="button" class="mini-btn" @click="reviewAndClose(s)">{{ lang.suggestionReview || 'Review' }}</button>
                <button type="button" class="mini-btn primary" @click="apply(s)">
                  <span v-if="requiresPremium(s) && !isPremium" class="premium-star" aria-hidden="true">⭐</span>
                  {{ primaryLabelFor(s) }}
                </button>
                <button type="button" class="mini-btn ghost" :aria-label="lang.suggestionDismiss || 'Dismiss'" @click="dismiss(s)">
                  <v-icon name="x"></v-icon>
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import { suggestionMixin } from '../suggestions'

const GROUP_ORDER = ['exactDuplicate', 'nearDuplicate', 'oversizedSession', 'orphanTags']
// Splitting each oversized session needs its own preview, so it is not batchable.
const BATCHABLE = new Set(['exactDuplicate', 'nearDuplicate', 'orphanTags'])

export default {
  name: 'SuggestionReportModal',
  mixins: [suggestionMixin],
  computed: {
    ...mapState(['lang', 'suggestions', 'showSuggestionReport']),
    ...mapGetters(['isPremium']),
    groups() {
      return GROUP_ORDER
        .map(type => ({ type, items: this.suggestions.filter(s => s.type === type) }))
        .filter(group => group.items.length > 0)
    }
  },
  watch: {
    suggestions(list) {
      // Close automatically once everything has been actioned.
      if (this.showSuggestionReport && list.length === 0) this.close()
    }
  },
  methods: {
    close() {
      this.$store.commit('setShowSuggestionReport', false)
    },
    canBatch(type) {
      return BATCHABLE.has(type)
    },
    groupTitle(group) {
      return this.titleFor(group.items[0])
    },
    groupCountLabel(group) {
      const template = this.lang.suggestionGroupCount || '{count} suggestions'
      return template.replace('{count}', group.items.length)
    },
    applyAllLabel(group) {
      const template = this.lang.suggestionApplyAll || 'Apply all {count}'
      return template.replace('{count}', group.items.length)
    },
    applyAll(group) {
      // Batch apply of a whole type is always premium (design §6).
      if (!this.isPremium) {
        this.$store.commit('setShowSubscriptionModal', true)
        return
      }
      // Copy first: apply() mutates the queue for reversible types.
      group.items.slice().forEach(s => this.apply(s))
    },
    reviewAndClose(s) {
      this.close()
      this.review(s)
    }
  }
}
</script>

<style scoped>
.report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.report-modal {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #2d3748);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 640px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.report-header h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.report-close {
  background: none;
  border: 0;
  cursor: pointer;
  padding: 4px;
  color: var(--text-secondary, #718096);
}

.report-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 24px 20px;
}

.report-empty {
  text-align: center;
  color: var(--text-secondary, #718096);
  padding: 40px 0;
}

.report-group {
  margin-top: 16px;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
  font-weight: 600;
}

.group-icon {
  width: 15px;
  height: 15px;
}

.group-count {
  color: var(--text-secondary, #718096);
  font-size: 12px;
  font-weight: 400;
}

.apply-all {
  background: transparent;
  border: 1px solid var(--primary-color, #eb5205);
  color: var(--primary-color, #eb5205);
  border-radius: 7px;
  padding: 5px 11px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}

.group-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.report-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border-color, #e2e8f0);
}

.report-item-desc {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary, #2d3748);
}

.report-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mini-btn {
  background: transparent;
  border: 1px solid var(--border-color, #e2e8f0);
  color: var(--text-primary, #2d3748);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.mini-btn.primary {
  background: var(--primary-color, #eb5205);
  border-color: var(--primary-color, #eb5205);
  color: #ffffff;
}

.mini-btn.ghost {
  border-color: transparent;
  color: var(--text-secondary, #718096);
  padding: 5px 6px;
}

.mini-btn.ghost svg {
  width: 14px;
  height: 14px;
}

.premium-star {
  margin-right: 3px;
}

@media (prefers-color-scheme: dark) {
  .report-modal {
    background: var(--card-bg, #2a2a2a);
    color: #e6e6e6;
  }

  .mini-btn {
    color: #e6e6e6;
    border-color: #3a3a3a;
  }

  .report-item {
    border-top-color: #3a3a3a;
  }
}
</style>
