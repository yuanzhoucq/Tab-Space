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
        { title: 'GitHub Actions documentation', url: 'https://docs.github.com/actions' },
        { title: 'MDN Web Docs', url: 'https://developer.mozilla.org' }
      ],
      tags: []
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

  const handlers = {
    CheckBookmarks: emitSessions,
    CheckDefault(msg) {
      emit('ReturnDefault', { id: msg.name, value: defaults[msg.name] || '' })
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
