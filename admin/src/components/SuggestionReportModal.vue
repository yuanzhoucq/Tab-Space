<template>
  <div v-if="showSuggestionReport" class="report-overlay" @click.self="close">
    <div class="report-modal" role="dialog" aria-modal="true">
      <header class="report-header">
        <div class="report-heading">
          <span class="report-mark" aria-hidden="true"><v-icon name="zap"></v-icon></span>
          <div>
            <p class="report-kicker">{{ groupCountLabel({ items: suggestions }) }}</p>
            <h2>{{ lang.suggestionReportTitle || 'Cleanup report' }}</h2>
          </div>
        </div>
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
              <span class="group-icon"><v-icon :name="iconFor(group.type)"></v-icon></span>
              <div>
                <h3>{{ groupTitle(group) }}</h3>
                <span class="group-count">{{ groupCountLabel(group) }}</span>
              </div>
            </div>
            <button v-if="canBatch(group.type)" type="button" class="apply-all" @click="applyAll(group)">
              {{ applyAllLabel(group) }}
            </button>
          </div>

          <ul class="group-items">
            <li
              v-for="s in group.items"
              :key="s.id"
              class="report-item"
              :class="{ 'is-expanded': isReviewOpen(s) }"
              :data-testid="'report-item-' + s.id">
              <div class="report-item-main">
                <div class="report-item-desc">{{ descFor(s) }}</div>
                <div class="report-item-actions">
                  <button
                    type="button"
                    class="mini-btn review"
                    :aria-expanded="isReviewOpen(s) ? 'true' : 'false'"
                    :data-testid="'review-suggestion-' + s.id"
                    @click="toggleReview(s)">
                    <v-icon name="eye"></v-icon>
                    {{ lang.suggestionReview || 'Review' }}
                  </button>
                  <button type="button" class="mini-btn primary" @click="apply(s)">
                    {{ primaryLabelFor(s) }}
                  </button>
                  <button type="button" class="mini-btn ghost" :aria-label="lang.suggestionDismiss || 'Dismiss'" @click="dismiss(s)">
                    <v-icon name="x"></v-icon>
                  </button>
                </div>
              </div>
              <transition name="report-expand">
                <div
                  v-if="isReviewOpen(s)"
                  :data-testid="'review-details-' + s.id"
                  class="report-item-detail">
                  <div
                    v-for="session in reviewItems(s)"
                    :key="session.uuid"
                    :data-testid="'review-session-' + session.uuid"
                    class="preview-card">
                    <div class="preview-card-head">
                      <div class="preview-title">{{ session.title || session.uuid }}</div>
                      <span class="preview-count">{{ (session.sites || []).length }} {{ lang.tabs || 'tabs' }}</span>
                    </div>
                    <ul class="preview-sites">
                      <li v-for="(site, index) in session.sites" :key="index">
                        <img class="preview-fav" :src="getFavicon(site.url)" :onerror="`src='${WangYeIcon}'`" alt="" />
                        <span class="preview-site-title">{{ site.title || site.url }}</span>
                      </li>
                    </ul>
                    <div v-if="session.tags && session.tags.length" class="preview-tags">
                      <span v-for="tag in session.tags" :key="tag.name" class="preview-tag">{{ tag.name }}</span>
                    </div>
                  </div>
                </div>
              </transition>
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
import WangYeIcon from '../assets/img/icon-webpage.svg'

const GROUP_ORDER = ['exactDuplicate', 'nearDuplicate', 'oversizedSession', 'orphanTags']
// Splitting each oversized session needs its own preview, so it is not batchable.
const BATCHABLE = new Set(['exactDuplicate', 'nearDuplicate', 'orphanTags'])

export default {
  name: 'SuggestionReportModal',
  mixins: [suggestionMixin],
  data() {
    return {
      WangYeIcon,
      reviewingSuggestionId: null
    }
  },
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
      this.reviewingSuggestionId = null
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
    reviewItems(s) {
      return this.sessionsByUuid(s.sessionUuids)
    },
    isReviewOpen(s) {
      return this.reviewingSuggestionId === s.id
    },
    toggleReview(s) {
      this.reviewingSuggestionId = this.isReviewOpen(s) ? null : s.id
    },
    getFavicon(url) {
      try {
        const wrapped = url.indexOf('://') === -1 ? 'http://' + url : url
        return new URL(wrapped).origin + '/favicon.ico'
      } catch {
        return ''
      }
    }
  }
}
</script>

<style scoped>
.report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 25, 35, 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
}

.report-modal {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #2d3748);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 18px;
  box-shadow: 0 24px 80px rgba(18, 24, 38, 0.28);
  width: 90%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.report-heading,
.group-title,
.report-item-main,
.preview-card-head {
  display: flex;
  align-items: center;
}

.report-heading {
  gap: 12px;
}

.report-mark,
.group-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.report-mark {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: var(--primary-color, #eb5205);
  background: rgba(235, 82, 5, 0.11);
}

.report-mark svg {
  width: 18px;
  height: 18px;
}

.report-kicker {
  margin: 0 0 2px;
  color: var(--text-secondary, #718096);
  font-size: 12px;
  line-height: 1.2;
}

.report-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.report-close {
  background: none;
  border: 0;
  cursor: pointer;
  border-radius: 8px;
  padding: 7px;
  color: var(--text-secondary, #718096);
}

.report-close:hover {
  background: rgba(113, 128, 150, 0.1);
}

.report-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px;
}

.report-empty {
  text-align: center;
  color: var(--text-secondary, #718096);
  padding: 40px 0;
}

.report-group {
  margin-top: 18px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 14px;
  overflow: hidden;
  background: var(--card-bg, #ffffff);
}

.report-group:first-of-type {
  margin-top: 0;
}

.group-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 16px;
  min-height: 62px;
  box-sizing: border-box;
  padding: 12px 14px;
  background: rgba(235, 82, 5, 0.035);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.group-title {
  gap: 10px;
  min-width: 0;
}

.group-title > div {
  min-width: 0;
}

.group-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: var(--primary-color, #eb5205);
  background: rgba(235, 82, 5, 0.1);
}

.group-icon svg {
  width: 16px;
  height: 16px;
}

.group-title h3 {
  margin: 0;
  color: var(--text-primary, #2d3748);
  font-size: 0.95rem;
  font-weight: 650;
}

.group-count {
  color: var(--text-secondary, #718096);
  font-size: 12px;
  font-weight: 400;
}

.apply-all {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 31px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid var(--primary-color, #eb5205);
  color: var(--primary-color, #eb5205);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}

.apply-all:hover {
  background: rgba(235, 82, 5, 0.08);
}

.group-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.report-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  padding: 0 14px;
  background: var(--card-bg, #ffffff);
}

.report-item + .report-item {
  border-top: 1px solid var(--border-color, #e2e8f0);
}

.report-item-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 62px;
  box-sizing: border-box;
  column-gap: 16px;
}

.report-item-desc {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--text-primary, #2d3748);
}

.report-item-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.mini-btn {
  justify-content: center;
  min-height: 31px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid var(--border-color, #e2e8f0);
  color: var(--text-primary, #2d3748);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.mini-btn:hover {
  background: rgba(113, 128, 150, 0.08);
}

.mini-btn.review {
  gap: 4px;
}

.mini-btn.review svg {
  width: 14px;
  height: 14px;
}

.mini-btn.primary {
  background: var(--primary-color, #eb5205);
  border-color: var(--primary-color, #eb5205);
  color: #ffffff;
}

.mini-btn.primary:hover {
  filter: brightness(0.95);
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

.report-item-detail {
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 14px;
  display: grid;
  gap: 10px;
  transform-origin: top center;
}

.preview-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  padding: 11px 12px;
  background: var(--bg-color, #f8f6f2);
}

.preview-card-head {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
}

.preview-title {
  overflow: hidden;
  color: var(--text-primary, #2d3748);
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-count {
  flex: 0 0 auto;
  color: var(--text-secondary, #718096);
  font-size: 12px;
}

.preview-sites {
  list-style: none;
  margin: 0;
  padding: 0;
}

.preview-sites li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 3px 0;
  font-size: 13px;
}

.preview-fav {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.preview-site-title {
  overflow: hidden;
  color: var(--text-primary, #2d3748);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.preview-tag {
  border-radius: 999px;
  padding: 2px 7px;
  background: rgba(235, 82, 5, 0.1);
  color: var(--primary-color, #eb5205);
  font-size: 11px;
}

.report-expand-enter-active,
.report-expand-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.report-expand-enter,
.report-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 640px) {
  .report-overlay {
    align-items: flex-end;
  }

  .report-modal {
    width: 100%;
    max-height: 92vh;
    border-radius: 18px 18px 0 0;
  }

  .report-header {
    padding: 18px;
  }

  .report-body {
    padding: 14px 14px 20px;
  }

  .group-head {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 10px;
  }

  .apply-all {
    justify-self: start;
  }

  .report-item-main {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 10px;
    padding: 12px 0;
  }

  .report-item-actions {
    justify-content: flex-start;
  }

  .mini-btn.ghost {
    margin-left: auto;
  }
}

@media (prefers-color-scheme: dark) {
  .report-modal {
    background: var(--card-bg, #2a2a2a);
    color: #e6e6e6;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .mini-btn {
    color: #e6e6e6;
    border-color: #3a3a3a;
  }

  .report-item {
    border-top-color: #3a3a3a;
  }

  .group-head,
  .report-item {
    background: var(--card-bg, #2a2a2a);
  }

  .group-title h3,
  .preview-title,
  .preview-site-title {
    color: #e6e6e6;
  }

  .preview-card {
    background: rgba(255, 255, 255, 0.035);
  }
}
</style>
