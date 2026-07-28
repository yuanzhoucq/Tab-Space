<template>
  <div class="split-modal-overlay" v-if="visible" @click.self="dismiss">
    <div class="split-modal" role="dialog" aria-modal="true">
      <header class="split-header">
        <div class="split-header-icon" aria-hidden="true">🤖</div>
        <div class="split-header-text">
          <h2>{{ lang.splitDetectedTitle || 'Multiple Topics Detected' }}</h2>
          <p class="text-muted">{{ summaryText }}</p>
        </div>
        <button type="button" class="split-close" :aria-label="lang.cancel || 'Close'" @click="dismiss">
          <v-icon name="x"></v-icon>
        </button>
      </header>

      <div class="clusters-container">
        <div class="preview-card" v-for="cluster in previewSessions" :key="cluster.uuid">
          <div class="preview-title">{{ cluster.title || defaultTitle }}</div>
          <ul class="preview-sites">
            <li v-for="(site, i) in cluster.sites" :key="i">
              <img class="preview-fav" :src="getFavicon(site.url)" :onerror="`src='${WangYeIcon}'`" alt="" />
              <span class="preview-site-title">{{ site.title || site.url }}</span>
            </li>
          </ul>
          <div class="preview-tags" v-if="cluster.tags && cluster.tags.length">
            <span class="preview-tag" v-for="tag in cluster.tags" :key="tag.name">{{ tag.name }}</span>
          </div>
        </div>
      </div>

      <footer class="split-footer">
        <p class="split-note">{{ lang.splitOriginalToTrash || 'The original session moves to Trash — you can restore it anytime.' }}</p>
        <div class="split-actions">
          <button type="button" class="split-btn-secondary" @click="keepAsSingle">
            {{ lang.keepAsSingle || 'Keep as 1 Session' }}
          </button>
          <button type="button" class="split-btn-primary" :disabled="validSessionCount === 0" @click="saveAsMultiple">
            {{ saveButtonText }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import WangYeIcon from '../assets/img/icon-webpage.svg'

export default {
  name: 'SplitPreviewModal',
  data() {
    return {
      WangYeIcon,
      previewSessions: []
    }
  },
  computed: {
    ...mapState(['lang', 'bridge', 'splitPreview']),
    ...mapGetters(['isPremium']),
    visible() {
      return Boolean(this.splitPreview && this.splitPreview.clusters && this.splitPreview.clusters.length > 0)
    },
    totalTabs() {
      return (this.splitPreview && this.splitPreview.totalTabs) || 0
    },
    originalUuid() {
      return (this.splitPreview && this.splitPreview.originalUuid) || null
    },
    validSessionCount() {
      return this.previewSessions.filter(s => s.sites.length > 0).length
    },
    defaultTitle() {
      return this.lang.newSession || 'New session'
    },
    summaryText() {
      const tabsWord = this.totalTabs === 1 ? (this.lang.tab || 'tab') : (this.lang.tabs || 'tabs')
      const topicsWord = this.previewSessions.length === 1 ? (this.lang.session || 'topic') : (this.lang.sessions || 'topics')
      return `${this.totalTabs} ${tabsWord} → ${this.previewSessions.length} ${topicsWord}`
    },
    saveButtonText() {
      const template = this.lang.saveAsMultiple || 'Save as {count} Sessions'
      return template.replace('{count}', this.validSessionCount)
    }
  },
  watch: {
    splitPreview: {
      immediate: true,
      handler(preview) {
        if (preview && preview.clusters) {
          this.previewSessions = preview.clusters.map((cluster, index) => ({
            uuid: `preview-${index}-${Date.now()}`,
            title: cluster.name || '',
            sites: [...(cluster.sites || [])],
            // Native returns tags as plain strings; SaveSplitSessions expects [Tag].
            tags: (cluster.tags || []).map(t => (typeof t === 'string' ? { name: t } : t))
          }))
        } else {
          this.previewSessions = []
        }
      }
    }
  },
  methods: {
    getFavicon(url) {
      try {
        const wrapped = url.indexOf('://') === -1 ? 'http://' + url : url
        return new URL(wrapped).origin + '/favicon.ico'
      } catch {
        return ''
      }
    },
    saveAsMultiple() {
      // Applying a split is premium (design §6: "preview visible, apply requires
      // subscription"). Free users get the upgrade prompt instead.
      if (!this.isPremium) {
        this.$store.commit('setShowSubscriptionModal', true)
        return
      }
      const validSessions = this.previewSessions.filter(s => s.sites.length > 0)
      const clustersData = validSessions.map(session => ({
        name: session.title,
        tags: session.tags,
        sites: session.sites
      }))
      // Native appends every new session first, then tags the original @Trash
      // (never a hard delete) — so this is trivially undoable.
      this.bridge.send({
        cmd: 'SaveSplitSessions',
        clusters: JSON.stringify(clustersData),
        originalUuid: this.originalUuid
      })
      this.$store.commit('setSplitPreview', null)
    },
    keepAsSingle() {
      this.$store.commit('setSplitPreview', null)
    },
    dismiss() {
      this.$store.commit('setSplitPreview', null)
    }
  }
}
</script>

<style scoped>
.split-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.split-modal {
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

.split-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.split-header-icon {
  font-size: 1.8rem;
}

.split-header-text {
  flex: 1;
  min-width: 0;
}

.split-header-text h2 {
  margin: 0 0 4px;
  font-size: 1.2rem;
  font-weight: 600;
}

.split-header-text p {
  margin: 0;
  font-size: 0.85rem;
}

.text-muted {
  color: var(--text-secondary, #718096);
}

.split-close {
  background: none;
  border: 0;
  cursor: pointer;
  padding: 4px;
  color: var(--text-secondary, #718096);
}

.split-close:hover {
  color: var(--text-primary, #2d3748);
}

.clusters-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preview-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  padding: 12px 14px;
  background: var(--bg-color, #f8f6f2);
}

.preview-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 8px;
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
  padding: 3px 0;
  font-size: 13px;
  min-width: 0;
}

.preview-fav {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.preview-site-title {
  overflow: hidden;
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
  background-color: #f0f0f0;
  border: 1px solid #e0e0e0;
  color: #666666;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
}

.split-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border-color, #e2e8f0);
  padding: 16px 24px;
}

.split-note {
  flex: 1 1 220px;
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-secondary, #718096);
}

.split-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 12px;
}

.split-btn-primary,
.split-btn-secondary {
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.split-btn-primary {
  background: var(--primary-color, #eb5205);
  color: #ffffff;
  border: none;
}

.split-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.split-btn-secondary {
  background: transparent;
  color: var(--text-primary, #2d3748);
  border: 1px solid var(--border-color, #e2e8f0);
}

.split-btn-secondary:hover {
  background: var(--bg-color, #f8f6f2);
}

@media (prefers-color-scheme: dark) {
  .split-modal {
    background: var(--card-bg, #2a2a2a);
    color: #e6e6e6;
  }

  .preview-card {
    background: rgba(255, 255, 255, 0.03);
    border-color: #3a3a3a;
  }

  .preview-tag {
    background-color: #404040;
    border-color: #555555;
    color: #d0d0d0;
  }

  .split-btn-secondary {
    color: #e6e6e6;
    border-color: #3a3a3a;
  }
}
</style>
