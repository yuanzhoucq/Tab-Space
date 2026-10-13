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

// `?mock=marketing` swaps in a fuller library for store screenshots: themed
// sessions with real, recognisable sites, titled in the browser's language.
function marketingSessions() {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  const t = (en, cn) => (zh ? cn : en)
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const site = (title, url) => ({ title, url })
  return [
    {
      uuid: 'mkt-kyoto',
      title: t('Kyoto trip', '京都之旅'),
      timestamp: now - 2 * hour,
      comment: '',
      sites: [
        site('Kyoto Travel Guide - What to do in Kyoto City', 'https://www.japan-guide.com/e/e2158.html'),
        site('Kyoto – Travel guide at Wikivoyage', 'https://en.wikivoyage.org/wiki/Kyoto'),
        site('Fushimi Inari Shrine - Kyoto Travel', 'https://www.japan-guide.com/e/e3915.html'),
        site('Inside Kyoto | Kyoto Travel Guide', 'https://www.insidekyoto.com'),
        site('Kyoto Itineraries', 'https://www.insidekyoto.com/kyoto-itineraries'),
        site('Sanjusangendo Temple - Kyoto Travel', 'https://www.japan-guide.com/e/e3900.html'),
        site('Japan National Tourism Organization', 'https://www.jnto.go.jp'),
        site('Airbnb | Kyoto – Holiday Rentals', 'https://www.airbnb.com/kyoto-japan/stays')
      ],
      tags: [{ name: t('Travel', '旅行') }, { name: '@Favorite' }]
    },
    {
      uuid: 'mkt-wwdc',
      title: 'WWDC26',
      timestamp: now - 26 * hour,
      comment: '',
      sites: [
        site('Videos - Apple Developer', 'https://developer.apple.com/videos/'),
        site('SwiftUI | Apple Developer Documentation', 'https://developer.apple.com/documentation/swiftui'),
        site('Human Interface Guidelines', 'https://developer.apple.com/design/human-interface-guidelines'),
        site('Swift - Apple Developer', 'https://developer.apple.com/swift/'),
        site('GitHub · Trending', 'https://github.com/trending')
      ],
      tags: [{ name: t('Work', '工作') }]
    },
    {
      uuid: 'mkt-thesis',
      title: t('Thesis: LLM agents', '论文：大模型智能体'),
      timestamp: now - 3 * 24 * hour,
      comment: '',
      sites: [
        site('ReAct: Synergizing Reasoning and Acting in Language Models', 'https://arxiv.org/abs/2210.03629'),
        site('arXiv.org e-Print archive', 'https://arxiv.org'),
        site('Coursera | Online Courses From Top Universities', 'https://www.coursera.org'),
        site('GitHub', 'https://github.com')
      ],
      tags: [{ name: t('Research', '研究') }]
    },
    {
      uuid: 'mkt-mac',
      title: t('New Mac setup', '新 Mac 配置'),
      timestamp: now - 5 * 24 * hour,
      comment: '',
      sites: [
        site('MacBook Pro - Apple', 'https://www.apple.com/macbook-pro/'),
        site('AirPods - Apple', 'https://www.apple.com/airpods/'),
        site('Amazon Best Sellers', 'https://www.amazon.com/gp/bestsellers'),
        site('The Verge', 'https://www.theverge.com')
      ],
      tags: [{ name: t('Shopping', '购物') }]
    },
    {
      uuid: 'mkt-design',
      title: t('Design inspiration', '设计灵感'),
      timestamp: now - 8 * 24 * hour,
      comment: '',
      sites: [
        site('Figma Community', 'https://www.figma.com/community'),
        site('Notion – The AI workspace that works for you', 'https://www.notion.so'),
        site('Explore GitHub', 'https://github.com/explore')
      ],
      tags: [{ name: t('Design', '设计') }]
    },
    {
      // Left untitled and untagged for the AI scene; EnhanceSession names it.
      uuid: 'mkt-untitled',
      title: '',
      timestamp: now - 10 * 24 * hour,
      comment: '',
      sites: [
        site('Introducing SwiftUI | Apple Developer Documentation', 'https://developer.apple.com/tutorials/swiftui'),
        site('SwiftUI by Example - Hacking with Swift', 'https://www.hackingwithswift.com/quick-start/swiftui'),
        site('Develop in Swift Tutorials', 'https://developer.apple.com/tutorials/develop-in-swift'),
        site('pointfreeco/swift-composable-architecture · GitHub', 'https://github.com/pointfreeco/swift-composable-architecture')
      ],
      tags: []
    }
  ]
}

// What the marketing library's AI enhance "finds" for its untitled session.
function marketingEnhancement() {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  return zh
    ? { title: '学习 SwiftUI', tags: [{ name: 'Swift' }, { name: '教程' }] }
    : { title: 'Learning SwiftUI', tags: [{ name: 'Swift' }, { name: 'Tutorial' }] }
}

export function installMockBridge() {
  if (window.__tabspace_bridge) return

  const clone = value => JSON.parse(JSON.stringify(value))
  const marketing = new URLSearchParams(window.location.search).get('mock') === 'marketing'
  let sessions = marketing ? marketingSessions() : sampleSessions()
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
      const enhanced = marketing
        ? marketingEnhancement()
        : { title: 'AI: ' + (msg.bookmarks[0].title || 'Organized session'), tags: [{ name: 'AI' }, { name: 'Research' }] }
      emit('ReturnEnhancedSession', {
        uuid,
        title: enhanced.title,
        tags: JSON.stringify(enhanced.tags),
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
      emit('ReturnSplitSaved', { originalUuid: msg.originalUuid, ok: true })
    },
    GetSuggestions() {
      emit('ReturnSuggestions', { suggestions: sampleSuggestions() })
    },
    DismissSuggestion(msg) {
      console.log('[mock bridge] DismissSuggestion', msg.id, msg.muteType ? '(mute type)' : '')
    },
    // The Mac reports three independent facts; flip these to preview the
    // unhealthy cards (a stopped helper, a signed-out Mac, a failed export).
    CheckSyncStatus() {
      const secondsAgo = seconds => Math.floor(Date.now() / 1000) - seconds
      emit('ReturnSyncStatus', {
        account: 'available',
        helper: 'running',
        hasHistory: true,
        lastImportAt: secondsAgo(240),
        lastExportAt: secondsAgo(90),
        recoveryPending: false
      })
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
      // The app gives every stored session a uuid; imports arrive without one.
      sessions.unshift(...clone(msg.bookmarks).map((bookmark, index) => ({
        ...bookmark,
        uuid: bookmark.uuid || `mock-imported-${Date.now()}-${index}`
      })))
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
