// Shared presentation + action logic for the AI suggestion engine
// (docs/ai-4.0-design.md §3). Used by the cleanup report opened from
// the dashboard's right-side organize toolbar button.
//
// Suggestion shape (from the native SuggestionEngine, protocol v2):
//   { id, type, sessionUuids: [String], tagNames: [String],
//     confidence: Number, impact: Number }
// where type is one of exactDuplicate | nearDuplicate | oversizedSession | orphanTags.
// The array arrives pre-sorted by score (confidence * impact), top first.

const ICONS = {
  exactDuplicate: 'copy',
  nearDuplicate: 'copy',
  oversizedSession: 'server',
  orphanTags: 'tag'
}

// Merge-type applies are half-irreversible, so a single free apply is NOT
// allowed (design §6): free users can preview/review but applying merges is
// premium. Split preview is free; the *save* is gated inside SplitPreviewModal.
// Orphan-tag removal is fully reversible → free.
const PREMIUM_SINGLE_APPLY = new Set(['exactDuplicate', 'nearDuplicate'])

export const suggestionMixin = {
  methods: {
    iconFor(type) {
      return ICONS[type] || 'zap'
    },
    langOf() {
      return this.$store.state.lang || {}
    },
    titleFor(s) {
      const lang = this.langOf()
      switch (s.type) {
        case 'exactDuplicate': return lang.suggestionExactDuplicateTitle || 'Duplicate sessions'
        case 'nearDuplicate': return lang.suggestionNearDuplicateTitle || 'Similar sessions'
        case 'oversizedSession': return lang.suggestionOversizedTitle || 'Large session'
        case 'orphanTags': return lang.suggestionOrphanTagsTitle || 'Unused tag'
        default: return lang.suggestionsTitle || 'Suggestion'
      }
    },
    descFor(s) {
      const lang = this.langOf()
      const count = Array.isArray(s.sessionUuids) ? s.sessionUuids.length : 0
      switch (s.type) {
        case 'exactDuplicate':
          return (lang.suggestionExactDuplicateDesc || '{count} identical sessions can be merged into one.').replace('{count}', count)
        case 'nearDuplicate':
          return lang.suggestionNearDuplicateDesc || 'These sessions share most of their tabs — merge them?'
        case 'oversizedSession':
          return (lang.suggestionOversizedDesc || 'This session has {count} tabs. Split it into topics?').replace('{count}', s.impact || 0)
        case 'orphanTags':
          return (lang.suggestionOrphanTagsDesc || 'The tag "{tag}" is used only once.').replace('{tag}', (s.tagNames && s.tagNames[0]) || '')
        default:
          return ''
      }
    },
    primaryLabelFor(s) {
      const lang = this.langOf()
      switch (s.type) {
        case 'exactDuplicate':
        case 'nearDuplicate': return lang.suggestionMerge || 'Merge'
        case 'oversizedSession': return lang.suggestionSplit || 'Split'
        case 'orphanTags': return lang.suggestionRemoveTag || 'Remove tag'
        default: return lang.suggestionApply || 'Apply'
      }
    },
    requiresPremium(s) {
      return PREMIUM_SINGLE_APPLY.has(s.type)
    },
    sessionsByUuid(uuids) {
      const all = this.$store.state.sessions || []
      return (uuids || []).map(uuid => all.find(x => x.uuid === uuid)).filter(Boolean)
    },
    apply(s) {
      const bridge = this.$store.state.bridge
      if (!bridge) return
      // Premium gate for merge-type single applies.
      if (this.requiresPremium(s) && !this.$store.getters.isPremium) {
        this.$store.commit('setShowSubscriptionModal', true)
        return
      }
      switch (s.type) {
        case 'exactDuplicate':
        case 'nearDuplicate': {
          // Keep the most complete session as the destination; when content
          // size ties, preserve the oldest session's title and timestamp.
          const group = this.sessionsByUuid(s.sessionUuids).slice().sort((a, b) => {
            const siteCountDifference = (b.sites || []).length - (a.sites || []).length
            if (siteCountDifference !== 0) return siteCountDifference
            const aTimestamp = Number(a.timestamp) || Number.MAX_SAFE_INTEGER
            const bTimestamp = Number(b.timestamp) || Number.MAX_SAFE_INTEGER
            if (aTimestamp !== bTimestamp) return aTimestamp - bTimestamp
            return (a.uuid || '').localeCompare(b.uuid || '')
          })
          if (group.length >= 2) {
            // Suggestion identity is based on normalized URL content, so the
            // native merge keeps one copy of each matching tab. The first
            // session survives, preserving the destination title/comment.
            bridge.send({ cmd: 'MergeSessions', bookmarks: group, deduplicateSites: true })
          }
          break
        }
        case 'oversizedSession': {
          const [session] = this.sessionsByUuid(s.sessionUuids)
          if (session) {
            this.$store.commit('setSplittingSessionId', session.uuid)
            bridge.send({ cmd: 'ClusterTabs', uuid: session.uuid, bookmarks: [session] })
          }
          break
        }
        case 'orphanTags': {
          const tagNames = s.tagNames || []
          this.sessionsByUuid(s.sessionUuids).forEach(session => {
            session.tags = session.tags.filter(t => !tagNames.includes(t.name))
            bridge.send({ cmd: 'UpdateSession', bookmarks: [session] })
          })
          this.removeFromQueue(s.id)
          break
        }
        default:
          break
      }
    },
    // Bring the affected sessions into view and flash them briefly.
    review(s) {
      this.$store.commit('setActiveTag', '')
      this.$store.commit('setKeyword', '')
      const uuids = s.sessionUuids || []
      this.$nextTick(() => {
        uuids.forEach(uuid => {
          const el = document.getElementById(uuid)
          if (!el) return
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('suggestion-highlight')
          setTimeout(() => el.classList.remove('suggestion-highlight'), 2400)
        })
      })
    },
    dismiss(s) {
      const bridge = this.$store.state.bridge
      if (bridge) bridge.send({ cmd: 'DismissSuggestion', id: s.id, muteType: false })
      this.removeFromQueue(s.id)
    },
    mute(s) {
      const bridge = this.$store.state.bridge
      // muteType + type tells the engine to stop surfacing this whole category.
      if (bridge) bridge.send({ cmd: 'DismissSuggestion', id: s.id, muteType: true, type: s.type })
      const remaining = (this.$store.state.suggestions || []).filter(x => x.type !== s.type)
      this.$store.commit('setSuggestions', remaining)
    },
    removeFromQueue(id) {
      const remaining = (this.$store.state.suggestions || []).filter(x => x.id !== id)
      this.$store.commit('setSuggestions', remaining)
    }
  }
}
