// Development-only mock of the native Tab Space bridge.
// Enabled by opening the dev server with `?mock` (e.g. http://localhost:4174/?mock#/).
// Never bundled in production: the caller guards on NODE_ENV === 'development'.

const day = 24 * 60 * 60 * 1000

function sampleSessions() {
  const now = Date.now()
  return [
    {
      uuid: 'mock-research',
      title: 'Research',
      timestamp: now - day,
      comment: '',
      sites: [
        { title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
        { title: '百度', url: 'https://www.baidu.com/' },
        { title: 'Hacker News', url: 'https://news.ycombinator.com' }
      ],
      tags: [{ name: 'Work' }, { name: '@Favorite' }]
    },
    {
      uuid: 'mock-reading',
      title: 'Reading list',
      timestamp: now - 2 * day,
      comment: '',
      sites: [
        { title: 'Claude agents documentation', url: 'https://docs.anthropic.com/agents' },
        { title: 'Cloudflare Pages documentation', url: 'https://developers.cloudflare.com/pages/' },
        { title: 'Hacker News', url: 'https://news.ycombinator.com' }
      ],
      tags: [{ name: 'Reading' }]
    },
    {
      uuid: 'mock-untitled',
      title: '',
      timestamp: now - 3 * day,
      comment: '',
      sites: [
        { title: 'Apple Developer', url: 'https://developer.apple.com' }
      ],
      tags: [{ name: 'Personal' }]
    },
    {
      uuid: 'mock-trashed',
      title: 'Old stuff',
      timestamp: now - 10 * day,
      comment: '',
      sites: [
        { title: 'Some old page', url: 'https://example.com' }
      ],
      tags: [{ name: '@Trash' }]
    }
  ]
}

export function installMockBridge() {
  if (window.__tabspace_bridge) return

  const clone = value => JSON.parse(JSON.stringify(value))
  let sessions = sampleSessions()
  const defaults = {}

  const emit = (name, message) => {
    setTimeout(() => {
      if (typeof window.__tabspace_bridge.onMessage === 'function') {
        window.__tabspace_bridge.onMessage(name, clone(message))
      }
    }, 0)
  }

  const emitSessions = () => emit('ReturnBookmarks', { value: sessions })
  const indexOf = uuid => sessions.findIndex(s => s.uuid === uuid)

  // --- AI (protocol v2) mock state ---
  let quotaRemaining = -1
  const quotaResetAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  let subscriptionStatus = 'active'
  let entitlementTier = 'pro'
  const quotaFields = () => ({ quotaRemaining, quotaResetAt })
  const spendQuota = () => {
    if (subscriptionStatus === 'active' || quotaRemaining === -1) return true
    if (quotaRemaining <= 0) return false
    quotaRemaining -= 1
    return true
  }
  const sampleSuggestions = () => JSON.stringify([
    { id: 'sug-dup', type: 'exactDuplicate', sessionUuids: ['mock-research', 'mock-reading'], tagNames: [], confidence: 1, impact: 5 },
    { id: 'sug-big', type: 'oversizedSession', sessionUuids: ['mock-research'], tagNames: [], confidence: 0.7, impact: 3 },
    { id: 'sug-orphan', type: 'orphanTags', sessionUuids: ['mock-untitled'], tagNames: ['Personal'], confidence: 1, impact: 1 }
  ])

  const handlers = {
    CheckBookmarks: emitSessions,
    CheckDefault(msg) {
      if (msg.name === 'tabspace-native-protocol-version') {
        emit('ReturnDefault', { id: msg.name, value: '2' })
        return
      }
      emit('ReturnDefault', { id: msg.name, value: defaults[msg.name] || '' })
    },
    EnhanceSession(msg) {
      const uuid = msg.bookmarks[0].uuid
      if (!spendQuota()) {
        emit('ReturnEnhancedSession', { uuid, error: 'quota_exceeded', ...quotaFields() })
        return
      }
      emit('ReturnEnhancedSession', {
        uuid,
        title: 'AI: ' + (msg.bookmarks[0].title || 'Organized session'),
        tags: JSON.stringify([{ name: 'AI' }, { name: 'Research' }]),
        ...quotaFields()
      })
    },
    ClusterTabs(msg) {
      const session = msg.bookmarks[0]
      if (!spendQuota()) {
        emit('ReturnSplitPreview', { originalUuid: session.uuid, error: 'quota_exceeded', ...quotaFields() })
        return
      }
      const half = Math.ceil(session.sites.length / 2)
      const clusters = [
        { name: 'Topic A', tags: ['Work'], sites: session.sites.slice(0, half) },
        { name: 'Topic B', tags: ['Reading'], sites: session.sites.slice(half) }
      ].filter(c => c.sites.length > 0)
      emit('ReturnSplitPreview', {
        clusters: JSON.stringify(clusters),
        totalTabs: session.sites.length,
        originalUuid: session.uuid,
        ...quotaFields()
      })
    },
    SaveSplitSessions(msg) {
      const clusters = JSON.parse(msg.clusters || '[]')
      const now = Date.now()
      const newSessions = clusters.map((c, i) => ({
        uuid: 'split-' + now + '-' + i, title: c.name, timestamp: now, comment: '',
        sites: c.sites, tags: c.tags || []
      }))
      sessions.unshift(...clone(newSessions))
      const original = sessions[indexOf(msg.originalUuid)]
      if (original && !original.tags.some(t => t.name === '@Trash')) original.tags.push({ name: '@Trash' })
      emitSessions()
    },
    GetSuggestions() {
      emit('ReturnSuggestions', { suggestions: sampleSuggestions() })
    },
    DismissSuggestion(msg) {
      console.log('[mock bridge] DismissSuggestion', msg.id, msg.muteType ? '(mute type)' : '')
    },
    CheckSubscriptionStatus() {
      emit('ReturnSubscriptionStatus', {
        status: subscriptionStatus,
        tier: entitlementTier,
        hasPermanentPlus: entitlementTier === 'plus',
        plusDisplayPrice: '$9.99',
        ...quotaFields()
      })
    },
    PurchaseSubscription() {
      emit('PurchaseResult', { redirected: true })
      // Simulate the user completing the purchase in the host app, so a later
      // CheckSubscriptionStatus (Settings mount / tab refocus) sees "active".
      setTimeout(() => {
        subscriptionStatus = 'active'
        entitlementTier = 'pro'
        quotaRemaining = -1
        console.log('[mock bridge] host-app purchase completed; status is now active')
      }, 1500)
    },
    RestorePurchases() {
      emit('ReturnSubscriptionStatus', {
        status: subscriptionStatus,
        tier: entitlementTier,
        hasPermanentPlus: entitlementTier === 'plus',
        plusDisplayPrice: '$9.99',
        redirected: true,
        ...quotaFields()
      })
    },
    SetDefault(msg) {
      defaults[msg.name] = msg.value
    },
    UpdateSession(msg) {
      msg.bookmarks.forEach(bookmark => {
        const i = indexOf(bookmark.uuid)
        if (i !== -1) sessions.splice(i, 1, clone(bookmark))
      })
      emitSessions()
    },
    AppendSessions(msg) {
      sessions.unshift(...clone(msg.bookmarks))
      emitSessions()
    },
    DeleteSession(msg) {
      const uuids = msg.bookmarks.map(b => b.uuid)
      sessions = sessions.filter(s => !uuids.includes(s.uuid))
      emitSessions()
    },
    UpSession(msg) {
      const i = indexOf(msg.bookmarks[0].uuid)
      if (i > 0) sessions.unshift(...sessions.splice(i, 1))
      emitSessions()
    },
    MoveSession(msg) {
      const [targetId, prevId] = msg.uuids
      const from = indexOf(targetId)
      if (from === -1) return
      const [target] = sessions.splice(from, 1)
      const to = targetId === prevId ? sessions.length : indexOf(prevId)
      sessions.splice(to === -1 ? sessions.length : to, 0, target)
      emitSessions()
    },
    MergeSessions(msg) {
      const [to, from] = msg.bookmarks
      const target = sessions[indexOf(to.uuid)]
      const source = sessions[indexOf(from.uuid)]
      if (target && source) {
        target.sites.push(...source.sites)
        const targetTagNames = new Set(target.tags.map(tag => tag.name))
        target.tags.push(...source.tags.filter(tag => {
          if (targetTagNames.has(tag.name)) return false
          targetTagNames.add(tag.name)
          return true
        }))
        sessions = sessions.filter(s => s.uuid !== source.uuid)
      }
      emitSessions()
    },
    RestoreSession(msg) {
      console.log('[mock bridge] RestoreSession', msg.bookmarks.map(b => b.uuid))
    }
  }

  window.__tabspace_bridge = {
    send(name, msg) {
      const handler = handlers[name]
      if (handler) handler(msg)
      else console.log('[mock bridge] unhandled command:', name, msg)
    },
    markReady() {}
  }

  window.dispatchEvent(new CustomEvent('tabspace:bridge-ready'))
  console.log('[mock bridge] installed — dashboard is running on sample data')
}
