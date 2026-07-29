const fs = require('fs/promises')
const { test, expect } = require('@playwright/test')

const sessions = [
  {
    uuid: 'session-research',
    title: 'Research',
    timestamp: 1767225600000,
    comment: '',
    sites: [
      { title: 'OpenAI', url: 'https://openai.com' },
      { title: 'Cloudflare Pages', url: 'https://developers.cloudflare.com/pages/' }
    ],
    tags: [{ name: 'Work' }]
  },
  {
    uuid: 'session-reading',
    title: 'Reading list',
    timestamp: 1767312000000,
    comment: '',
    sites: [{ title: 'GitHub Actions', url: 'https://docs.github.com/actions' }],
    tags: []
  }
]

const backups = [
  {
    filename: 'backup-2026-07-15.tabspace',
    createdAt: 1784073600,
    sessionCount: 2,
    fileSize: 2048
  }
]

const runtimeErrors = new WeakMap()

test.beforeEach(async ({ page }) => {
  const errors = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
})

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([])
})

async function openDashboard(page, options = {}) {
  const initialSessions = options.initialSessions || []
  const expectedSessionCount = options.expectedSessionCount === undefined
    ? initialSessions.length
    : options.expectedSessionCount

  await page.addInitScript(({
    testSessions,
    testBackups,
    testSuggestions,
    nativeProtocolVersion,
    malformedBookmarks,
    bundledDashboard,
    collapseSessions,
    preferredLanguage,
    bannerStorageUnavailable,
    subscriptionStatus,
    entitlementTier,
    plusDisplayPrice
  }) => {
    const clone = value => JSON.parse(JSON.stringify(value))
    const settingsKey = 'tabspace-e2e-settings'
    if (collapseSessions) localStorage.setItem('tabspace-session-cards-collapsed', 'true')
    const storedSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}')
    if (preferredLanguage) storedSettings['preferred-language'] = preferredLanguage
    let currentSessions = clone(testSessions)

    window.__tabspaceBridgeCommands = []
    window.__tabspaceRestoredSessions = []

    const emit = (messageName, message = {}) => {
      setTimeout(() => {
        if (typeof window.__tabspace_bridge.onMessage === 'function') {
          window.__tabspace_bridge.onMessage(messageName, clone(message))
        }
      }, 0)
    }

    const returnBookmarks = () => {
      emit('ReturnBookmarks', {
        value: malformedBookmarks ? '{invalid-json' : currentSessions
      })
    }

    window.__tabspaceTest = {
      setSessions(value) {
        currentSessions = clone(value)
      },
      emit
    }

    const nativeBridge = {
      onMessage: null,
      markReady() {},
      send(name, payload) {
        window.__tabspaceBridgeCommands.push({ name, payload: clone(payload) })

        if (name === 'CheckBookmarks') {
          returnBookmarks()
          return
        }

        if (name === 'CheckDefault') {
          emit('ReturnDefault', {
            id: payload.name,
            value: payload.name === 'tabspace-native-protocol-version'
              ? nativeProtocolVersion
              : (storedSettings[payload.name] || '')
          })
          return
        }

        if (name === 'GetSuggestions') {
          emit('ReturnSuggestions', { suggestions: JSON.stringify(testSuggestions) })
          return
        }

        if (name === 'CheckSubscriptionStatus') {
          emit('ReturnSubscriptionStatus', {
            status: subscriptionStatus,
            ...(Number(nativeProtocolVersion) >= 2
              ? {
                  tier: entitlementTier || (subscriptionStatus === 'active' ? 'pro' : 'free'),
                  hasPermanentPlus: entitlementTier === 'plus',
                  ...(plusDisplayPrice ? { plusDisplayPrice } : {})
                }
              : {}),
            quotaRemaining: subscriptionStatus === 'active' ? -1 : 5
          })
          return
        }

        if (name === 'SetDefault') {
          storedSettings[payload.name] = payload.value
          localStorage.setItem(settingsKey, JSON.stringify(storedSettings))
          emit('ReturnDefault', { id: payload.name, value: payload.value })
          return
        }

        if (name === 'ListBackups') {
          emit('ReturnBackups', { backups: JSON.stringify(testBackups) })
          return
        }

        if (name === 'ForceBackup') {
          emit('BackupComplete')
          return
        }

        if (name === 'RestoreBackup') {
          returnBookmarks()
          return
        }

        if (name === 'UpdateSession') {
          for (const updatedSession of payload.bookmarks || []) {
            const index = currentSessions.findIndex(session => session.uuid === updatedSession.uuid)
            if (index !== -1) currentSessions.splice(index, 1, clone(updatedSession))
          }
          returnBookmarks()
          return
        }

        if (name === 'AppendSessions') {
          // Mirrors CommercializationConfig.canCreateSessions: Free stores at
          // most five sessions and the native side saves none of a batch that
          // would cross the line. Only protocol v2 reports a tier, and only
          // those builds enforce the limit.
          const requested = (payload.bookmarks || []).length
          const tier = entitlementTier || (subscriptionStatus === 'active' ? 'pro' : 'free')
          if (Number(nativeProtocolVersion) >= 2 && tier === 'free'
            && currentSessions.length + requested > 5) {
            emit('SessionLimitReached', { limit: 5 })
            return
          }
          for (const [index, appendedSession] of (payload.bookmarks || []).entries()) {
            const normalizedSession = clone(appendedSession)
            normalizedSession.uuid ||= `imported-${Date.now()}-${index}`
            currentSessions.unshift(normalizedSession)
          }
          returnBookmarks()
          return
        }

        if (name === 'DeleteSession') {
          const deletedIds = new Set((payload.bookmarks || []).map(session => session.uuid))
          currentSessions = currentSessions.filter(session => !deletedIds.has(session.uuid))
          returnBookmarks()
          return
        }

        if (name === 'UpSession') {
          const sessionId = payload.bookmarks && payload.bookmarks[0] && payload.bookmarks[0].uuid
          const index = currentSessions.findIndex(session => session.uuid === sessionId)
          if (index > 0) currentSessions.unshift(currentSessions.splice(index, 1)[0])
          returnBookmarks()
          return
        }

        if (name === 'MergeSessions') {
          const [targetSession, sourceSession] = payload.bookmarks || []
          const targetIndex = targetSession ? currentSessions.findIndex(session => session.uuid === targetSession.uuid) : -1
          const sourceIndex = sourceSession ? currentSessions.findIndex(session => session.uuid === sourceSession.uuid) : -1
          if (targetIndex !== -1 && sourceIndex !== -1) {
            const target = currentSessions[targetIndex]
            const source = currentSessions[sourceIndex]
            target.sites.push(...source.sites)
            const targetTagNames = new Set(target.tags.map(tag => tag.name))
            target.tags.push(...source.tags.filter(tag => {
              if (targetTagNames.has(tag.name)) return false
              targetTagNames.add(tag.name)
              return true
            }))
            currentSessions = currentSessions.filter(session => session.uuid !== sourceSession.uuid)
          }
          returnBookmarks()
          return
        }

        if (name === 'RestoreSession') {
          window.__tabspaceRestoredSessions = (payload.bookmarks || []).map(session => session.uuid)
        }
      }
    }

    if (bundledDashboard) {
      nativeBridge.fallbackToBundled = () => {
        window.__tabspaceBundledDashboardOpened = true
      }
    }

    window.__tabspace_bridge = nativeBridge

    if (bannerStorageUnavailable) {
      const storageGetItem = Storage.prototype.getItem
      const storageSetItem = Storage.prototype.setItem
      Storage.prototype.getItem = function(key) {
        if (key === 'tabspace-ios-banner-dismissed') throw new Error('Storage unavailable')
        return storageGetItem.call(this, key)
      }
      Storage.prototype.setItem = function(key, value) {
        if (key === 'tabspace-ios-banner-dismissed') throw new Error('Storage unavailable')
        return storageSetItem.call(this, key, value)
      }
    }
  }, {
    testSessions: initialSessions,
    testBackups: options.backups || [],
    testSuggestions: options.suggestions || [],
    nativeProtocolVersion: options.nativeProtocolVersion || '1',
    malformedBookmarks: Boolean(options.malformedBookmarks),
    bundledDashboard: Boolean(options.bundledDashboard),
    collapseSessions: Boolean(options.collapseSessions),
    preferredLanguage: options.preferredLanguage || '',
    bannerStorageUnavailable: Boolean(options.bannerStorageUnavailable),
    subscriptionStatus: options.subscriptionStatus || 'free',
    entitlementTier: options.entitlementTier || '',
    plusDisplayPrice: options.plusDisplayPrice || ''
  })

  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }))
  await page.goto('/')

  if (expectedSessionCount !== null) {
    await expect(page.locator('.session')).toHaveCount(expectedSessionCount)
  }
}

test('opens AI organization suggestions from the right toolbar without showing a banner', async ({ page }) => {
  const sessionsWithMatchingTabs = [
    sessions[0],
    {
      ...sessions[0],
      uuid: 'session-reading',
      title: 'Reading list',
      timestamp: 1767312000000,
      sites: sessions[0].sites.map(site => ({ ...site })),
      tags: [{ name: 'Personal' }]
    }
  ]
  await openDashboard(page, {
    initialSessions: sessionsWithMatchingTabs,
    nativeProtocolVersion: '2',
    subscriptionStatus: 'active',
    entitlementTier: 'pro',
    suggestions: [{
      id: 'duplicate-sessions',
      type: 'exactDuplicate',
      sessionUuids: ['session-research', 'session-reading'],
      tagNames: [],
      confidence: 1,
      impact: 3
    }]
  })

  await expect.poll(() => lastBridgeCommand(page, 'PrepareAI')).not.toBeNull()
  await expect(page.getByTestId('ai-suggestion-card')).toHaveCount(0)
  const organize = page.getByTestId('organize-library')
  await expect(organize).toBeVisible()
  await expect(organize).toHaveAttribute('aria-label', 'View all 1 suggestions')
  await expect(organize.getByTestId('organize-suggestion-count')).toHaveText('1')

  await organize.click()
  const report = page.getByRole('dialog')
  await expect(report).toBeVisible()
  await expect(report.getByRole('heading', { name: 'Cleanup report' })).toBeVisible()
  await expect(report).toContainText('Duplicate sessions')
  await expect(report).not.toContainText('⭐')

  const review = report.getByTestId('review-suggestion-duplicate-sessions')
  await expect(review).toHaveAttribute('aria-expanded', 'false')
  await review.click()
  const details = report.getByTestId('review-details-duplicate-sessions')
  await expect(details.getByTestId('review-session-session-research')).toContainText('Research')
  await expect(details.getByTestId('review-session-session-research')).toContainText('OpenAI')
  await expect(details.getByTestId('review-session-session-reading')).toContainText('Reading list')
  await expect(details.getByTestId('review-session-session-reading')).toContainText('OpenAI')
  await expect(details.getByTestId('review-session-session-reading')).toContainText('Personal')
  const item = report.getByTestId('report-item-duplicate-sessions')
  // The panel slides down from translateY(-4px); measuring mid-transition puts
  // it above the row it belongs under.
  await expect.poll(() => details.evaluate(element => getComputedStyle(element).transform)).toBe('none')
  const layout = await item.evaluate(element => {
    const row = element.querySelector('.report-item-main').getBoundingClientRect()
    const preview = element.querySelector('.report-item-detail').getBoundingClientRect()
    return {
      rowBottom: row.bottom,
      previewTop: preview.top,
      rowLeft: row.left,
      previewLeft: preview.left,
      rowRight: row.right,
      previewRight: preview.right
    }
  })
  expect(layout.previewTop).toBeGreaterThanOrEqual(layout.rowBottom - 1)
  expect(Math.abs(layout.previewLeft - layout.rowLeft)).toBeLessThanOrEqual(1)
  expect(Math.abs(layout.previewRight - layout.rowRight)).toBeLessThanOrEqual(1)
  await expect(review).toHaveAttribute('aria-expanded', 'true')
  await expect(report).toBeVisible()
})

test('shows the iOS launch banner at card width and persists dismissal', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  const banner = page.getByTestId('ios-banner')
  await expect(banner).toBeVisible()
  await expect(banner.getByRole('link', { name: 'Get the mobile app' })).toHaveAttribute(
    'href',
    /apps\.apple\.com\/us\/app\/tab-space-tab-saver\/id6790127383/
  )
  await expect(page.getByTestId('ios-app-link')).toHaveAttribute(
    'href',
    /apps\.apple\.com\/us\/app\/tab-space-tab-saver\/id6790127383/
  )

  await expect.poll(() => page.evaluate(() => {
    const bannerRect = document.querySelector('[data-testid="ios-banner"]').getBoundingClientRect()
    const cardRect = document.querySelector('.session').getBoundingClientRect()
    const sidebarRect = document.querySelector('.session-sidebar').getBoundingClientRect()
    return Math.max(
      Math.abs(bannerRect.left - cardRect.left),
      Math.abs(bannerRect.right - cardRect.right),
      Math.abs(bannerRect.top - sidebarRect.top)
    )
  })).toBeLessThanOrEqual(1)

  await banner.getByRole('button', { name: 'Dismiss' }).click()
  await expect(banner).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('ios-banner')).toHaveCount(0)
  await expect(page.getByTestId('ios-app-link')).toBeVisible()
})

test('uses the China App Store link and dismisses without browser storage', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: sessions,
    preferredLanguage: 'zh-cn',
    bannerStorageUnavailable: true
  })

  const banner = page.getByTestId('ios-banner')
  await expect(banner.getByRole('link', { name: '获取移动版' })).toHaveAttribute(
    'href',
    /apps\.apple\.com\/cn\/app\//
  )
  await expect(page.getByTestId('ios-app-link')).toHaveAttribute(
    'href',
    /apps\.apple\.com\/cn\/app\//
  )
  await banner.getByRole('button', { name: '关闭' }).click()
  await expect(banner).toHaveCount(0)

  await page.getByRole('link', { name: '设置' }).click()
  await page.getByRole('link', { name: '返回' }).click()
  await expect(page.getByTestId('ios-banner')).toHaveCount(0)
})

async function openAppExtensionDashboard(page, initialSessions) {
  await page.addInitScript(testSessions => {
    const clone = value => JSON.parse(JSON.stringify(value))
    const bridgeEvent = name => `tabspace:app-extension:${name}`
    window.__tabspaceBridgeCommands = []

    const emit = (name, message = {}) => {
      document.dispatchEvent(new CustomEvent(bridgeEvent('message'), {
        detail: JSON.stringify({ name, message: clone(message) })
      }))
    }
    const announce = () => {
      document.dispatchEvent(new CustomEvent(bridgeEvent('ready'), {
        detail: JSON.stringify({ protocolVersion: 1 })
      }))
    }

    document.addEventListener(bridgeEvent('probe'), announce)
    document.addEventListener(bridgeEvent('command'), event => {
      const command = JSON.parse(event.detail)
      window.__tabspaceBridgeCommands.push(clone(command))
      if (command.name === 'CheckBookmarks') {
        emit('ReturnBookmarks', { value: clone(testSessions) })
      } else if (command.name === 'CheckDefault') {
        emit('ReturnDefault', {
          id: command.data.name,
          value: command.data.name === 'tabspace-native-protocol-version' ? '1' : ''
        })
      }
    })
  }, initialSessions)

  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }))
  await page.goto('http://localhost:47317/')
}

async function lastBridgeCommand(page, name) {
  return page.evaluate(commandName => {
    const commands = window.__tabspaceBridgeCommands.filter(command => command.name === commandName)
    return commands.at(-1) || null
  }, name)
}

async function bridgeCommandCount(page, name) {
  return page.evaluate(commandName => (
    window.__tabspaceBridgeCommands.filter(command => command.name === commandName).length
  ), name)
}

test('selects and moves multiple tabs to an existing session', async ({ page }) => {
  const bulkMoveSessions = [
    {
      ...sessions[0],
      sites: [
        ...sessions[0].sites,
        { title: 'Keep in Research', url: 'https://example.com/keep' }
      ]
    },
    sessions[1]
  ]
  await openDashboard(page, { initialSessions: bulkMoveSessions })

  const research = page.getByTestId('session-session-research')
  await research.hover()
  await research.getByTestId('bulk-select-tabs').click()
  await expect(research.getByTestId('bulk-move-bar')).toBeVisible()
  await expect(research.getByTestId('selected-tabs-count')).toHaveText('0 selected')
  await expect(research.locator('.del-item')).toHaveCount(0)
  await expect(research.getByTestId('restore-session')).toHaveCount(0)

  await research.getByTestId('select-site').nth(0).click()
  await research.getByTestId('select-site').nth(1).click()
  await expect(research.getByTestId('selected-tabs-count')).toHaveText('2 selected')
  await expect(research.getByTestId('bulk-move-submit')).toBeDisabled()

  await research.getByTestId('bulk-move-target').selectOption('session-reading')
  await expect(research.getByTestId('bulk-move-submit')).toBeEnabled()
  await research.getByTestId('bulk-move-submit').click()

  await expect.poll(() => page.evaluate(() => {
    return window.__tabspaceBridgeCommands
      .filter(command => command.name === 'UpdateSession')
      .map(command => ({
        uuid: command.payload.bookmarks[0].uuid,
        titles: command.payload.bookmarks[0].sites.map(site => site.title)
      }))
  })).toEqual([
    {
      uuid: 'session-reading',
      titles: ['GitHub Actions', 'OpenAI', 'Cloudflare Pages']
    },
    {
      uuid: 'session-research',
      titles: ['Keep in Research']
    }
  ])

  await expect(research.getByTestId('visible-site')).toHaveCount(1)
  await expect(research).toContainText('Keep in Research')
  const reading = page.getByTestId('session-session-reading')
  await expect(reading.getByTestId('visible-site')).toHaveCount(3)
  await expect(reading).toContainText('OpenAI')
  await expect(reading).toContainText('Cloudflare Pages')
})

test('keeps the dragged tab preview under the pointer', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })
  const research = page.getByTestId('session-session-research')
  const reading = page.getByTestId('session-session-reading')
  const sourceTabs = research.getByTestId('visible-site')
  await expect(sourceTabs).toHaveCount(2)

  const sourceBox = await sourceTabs.nth(0).boundingBox()
  const targetBox = await reading.getByTestId('visible-site').boundingBox()
  const start = {
    x: sourceBox.x + sourceBox.width - 12,
    y: sourceBox.y + sourceBox.height / 2
  }
  const target = {
    x: targetBox.x + targetBox.width - 12,
    y: targetBox.y + targetBox.height / 2
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, start.y + 20, { steps: 4 })
  const preview = page.locator('.site-drag-fallback')
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate(element => element.parentElement.tagName)).toBe('BODY')
  await page.mouse.move(target.x, target.y, { steps: 8 })

  const previewBox = await preview.boundingBox()
  expect(target.x).toBeGreaterThanOrEqual(previewBox.x)
  expect(target.x).toBeLessThanOrEqual(previewBox.x + previewBox.width)
  expect(target.y).toBeGreaterThanOrEqual(previewBox.y)
  expect(target.y).toBeLessThanOrEqual(previewBox.y + previewBox.height)
  await page.mouse.up()
})

// Homes in on the target while the drag is live: dropping a tab removes it from
// the source list and inserts a placeholder session, so the target keeps moving
// under the pointer.
async function dragTabOnto(page, sourceTab, targetTab) {
  const sourceBox = await sourceTab.boundingBox()
  let x = sourceBox.x + sourceBox.width - 12
  let y = sourceBox.y + sourceBox.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  y += 15
  await page.mouse.move(x, y, { steps: 4 })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await page.waitForTimeout(50)
    const targetBox = await targetTab.boundingBox()
    const deltaX = targetBox.x + targetBox.width - 12 - x
    const deltaY = targetBox.y + targetBox.height / 2 - y
    if (Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) break
    x += Math.max(-15, Math.min(15, deltaX))
    y += Math.max(-15, Math.min(15, deltaY))
    await page.mouse.move(x, y)
  }
  await page.waitForTimeout(150)
  await page.mouse.up()
}

test('offers the AI actions on titles-only rows', async ({ page }) => {
  const splittableSessions = [
    {
      ...sessions[0],
      sites: [...sessions[0].sites, { title: 'Hacker News', url: 'https://news.ycombinator.com' }]
    },
    sessions[1]
  ]
  await openDashboard(page, {
    initialSessions: splittableSessions,
    nativeProtocolVersion: '2',
    subscriptionStatus: 'active',
    entitlementTier: 'pro'
  })
  // The menu overlays the list while the pointer rests on it, so step away
  // before touching a row.
  const chooseView = async mode => {
    await page.getByTestId('view-mode-menu').hover()
    await page.getByTestId(`view-mode-${mode}`).click()
    await page.mouse.move(0, 300)
    await expect(page.getByTestId('view-mode-titles')).toBeHidden()
  }
  await chooseView('titles')

  const research = page.getByTestId('titles-only-session-card').getByTestId('session-session-research')
  const reading = page.getByTestId('titles-only-session-card').getByTestId('session-session-reading')

  // Open stays the rightmost control on the row.
  const order = await research.locator('.titles-only-session-summary').evaluate(row => (
    [...row.querySelectorAll('button')].map(button => button.dataset.testid)
  ))
  expect(order.slice(-3)).toEqual(['ai-enhance-session', 'ai-split-session', 'restore-session'])

  // Splitting needs at least three tabs; the single-tab session only enhances.
  await expect(reading.getByTestId('ai-enhance-session')).toHaveCount(1)
  await expect(reading.getByTestId('ai-split-session')).toHaveCount(0)

  await research.getByTestId('ai-enhance-session').click()
  await expect.poll(() => lastBridgeCommand(page, 'EnhanceSession')).toMatchObject({
    payload: { uuid: 'session-research' }
  })

  await chooseView('expanded')
  await chooseView('titles')
  await research.getByTestId('ai-split-session').click()
  await expect.poll(() => lastBridgeCommand(page, 'ClusterTabs')).toMatchObject({
    payload: { uuid: 'session-research' }
  })
})

test('scrolls rather than squashing the tag filters in a short window', async ({ page }) => {
  const taggedSessions = Array.from({ length: 12 }, (unused, index) => ({
    uuid: `session-${index}`,
    title: `Session ${index + 1}`,
    timestamp: 1767225600000 + index,
    comment: '',
    sites: [{ title: `Example ${index}`, url: `https://example.com/${index}` }],
    tags: [{ name: `Tag ${String(index).padStart(2, '0')}` }]
  }))
  await page.setViewportSize({ width: 1280, height: 380 })
  await openDashboard(page, { initialSessions: taggedSessions })

  const sidebar = page.locator('.session-sidebar')
  const filters = sidebar.locator('.tag-filter')
  await expect(filters.first()).toBeVisible()

  // The rail is capped to the window, so its content has to overflow…
  const metrics = await sidebar.evaluate(element => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  }))
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)

  // …and each filter has to keep its full height instead of being squeezed to
  // fit, which is what a column flex container does to its children by default.
  const heights = await filters.evaluateAll(elements => elements.map(element => (
    Math.round(element.getBoundingClientRect().height)
  )))
  const tallest = Math.max(...heights)
  for (const height of heights) expect(height).toBe(tallest)
  expect(tallest).toBeGreaterThanOrEqual(30)
})

test('keeps the tag filters and the toolbar pinned while the list scrolls', async ({ page }) => {
  const manySessions = Array.from({ length: 14 }, (unused, index) => ({
    uuid: `session-${index}`,
    title: `Session ${index + 1}`,
    timestamp: 1767225600000 + index,
    comment: '',
    sites: [
      { title: `Example ${index}`, url: `https://example.com/${index}` },
      { title: `Another ${index}`, url: `https://example.org/${index}` }
    ],
    tags: [{ name: index % 2 ? 'Work' : 'Reading' }]
  }))
  await openDashboard(page, { initialSessions: manySessions })

  const sidebar = page.locator('.session-sidebar')
  const hub = page.locator('.session-hub')
  const tops = async () => page.evaluate(() => ({
    sidebar: Math.round(document.querySelector('.session-sidebar').getBoundingClientRect().top),
    hub: Math.round(document.querySelector('.session-hub').getBoundingClientRect().top)
  }))

  const resting = await tops()
  expect(resting.sidebar).toBeGreaterThan(60)

  await page.evaluate(() => window.scrollTo(0, 700))
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(700)
  const pinned = await tops()
  expect(pinned.sidebar).toBe(16)
  expect(pinned.hub).toBe(16)
  await expect(sidebar.getByTestId('filter-all')).toBeInViewport()
  await expect(hub.getByTestId('add-session')).toBeInViewport()
})

test('marks the dashboard title with a Pro badge once subscribed', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions, nativeProtocolVersion: '2' })
  await expect(page.getByTestId('pro-badge')).toHaveCount(0)

  await openDashboard(page, {
    initialSessions: sessions,
    nativeProtocolVersion: '2',
    subscriptionStatus: 'active'
  })
  const badge = page.getByTestId('pro-badge')
  await expect(badge).toHaveText('Pro')
  await expect(badge).toHaveAttribute('aria-label', 'Pro')

  // Sits at the top right of the wordmark, not on its baseline.
  const placement = await page.locator('#title h1').evaluate(heading => {
    const wordmark = heading.firstChild.nodeType === Node.TEXT_NODE
      ? (() => {
        const range = document.createRange()
        range.selectNodeContents(heading.firstChild)
        return range.getBoundingClientRect()
      })()
      : heading.getBoundingClientRect()
    const badge = heading.querySelector('[data-testid="pro-badge"]').getBoundingClientRect()
    return {
      wordmarkTop: wordmark.top,
      wordmarkBottom: wordmark.bottom,
      wordmarkRight: wordmark.right,
      badgeTop: badge.top,
      badgeBottom: badge.bottom,
      badgeLeft: badge.left
    }
  })
  expect(placement.badgeLeft).toBeGreaterThanOrEqual(placement.wordmarkRight - 1)
  expect((placement.badgeTop + placement.badgeBottom) / 2)
    .toBeLessThan((placement.wordmarkTop + placement.wordmarkBottom) / 2)
})

test('maps protocol v2 Plus and keeps the weekly AI trial available', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: sessions,
    nativeProtocolVersion: '2',
    entitlementTier: 'plus',
    plusDisplayPrice: '$9.99'
  })

  await expect.poll(() => bridgeCommandCount(page, 'PrepareAI')).toBe(1)
  const card = page.getByTestId('session-session-research')
  await card.hover()
  await expect(card.getByTestId('ai-enhance-session')).toBeVisible()
  await card.getByTestId('ai-enhance-session').click()
  await expect.poll(() => bridgeCommandCount(page, 'EnhanceSession')).toBe(1)
  await expect(page.getByTestId('plan-status-link')).toContainText('5 AI')
  await page.getByTestId('settings-link').click()
  await expect(page.getByTestId('plan-status')).toContainText('Plus · Permanent')
  await expect(page.getByTestId('settings-plus-price')).toHaveText('$9.99')
  await expect(page.getByTestId('settings-plus-price')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(page.getByTestId('settings-plus-summary')).toBeVisible()
  await page.getByTestId('settings-upgrade').click()
  // The plan story lives in one comparison table now; Settings also mentions
  // multi-browser, so scope the assertion to the table inside the dialog.
  const comparison = page.getByTestId('plan-comparison')
  await expect(comparison.getByText('Multi-browser support')).toBeVisible()
  await expect(comparison.getByRole('columnheader', { name: /Plus/ })).toContainText('Your plan')
  await expect(page.getByTestId('modal-plus-price')).toHaveText('$9.99')
  await expect(page.getByTestId('modal-plus-price')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(page.getByTestId('plan-yearly')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('plan-monthly')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('plan-monthly').click()
  await expect(page.getByTestId('plan-monthly')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('plan-yearly')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('subscription-submit').click()
  await expect.poll(() => lastBridgeCommand(page, 'PurchaseSubscription')).toMatchObject({
    payload: { productId: 'tabspace.pro.monthly' }
  })
})

test('lets a Pro subscriber reopen the plan comparison from Settings', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: sessions,
    nativeProtocolVersion: '2',
    entitlementTier: 'pro'
  })

  await page.getByTestId('settings-link').click()
  await expect(page.getByTestId('plan-status')).toContainText('Pro')
  // Upgrading is meaningless at this tier, but reading the plan is not.
  await expect(page.getByTestId('settings-upgrade')).toHaveCount(0)
  await page.getByTestId('settings-view-plans').click()

  await expect(page.getByTestId('pro-active-message')).toBeVisible()
  const comparison = page.getByTestId('plan-comparison')
  await expect(comparison.getByRole('columnheader', { name: /Pro/ })).toContainText('Your plan')
  // No purchase controls for someone who already subscribed.
  await expect(page.getByTestId('subscription-submit')).toHaveCount(0)
  await page.getByTestId('modal-manage-subscription').click()
  await expect.poll(() => lastBridgeCommand(page, 'PurchaseSubscription')).toBeTruthy()
})

test('offers multi-browser setup from Settings and gates it behind Pro', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: sessions,
    nativeProtocolVersion: '2',
    entitlementTier: 'free'
  })

  await page.getByTestId('settings-link').click()
  const card = page.getByTestId('multi-browser-card')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('multi-browser-steps').locator('li')).toHaveCount(3)
  await card.getByTestId('multi-browser-upgrade').click()
  await expect(page.getByTestId('plan-comparison')).toBeVisible()
})

test('saves both sessions after dragging a tab across them', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })
  const research = page.getByTestId('session-session-research')
  const reading = page.getByTestId('session-session-reading')

  await dragTabOnto(page, research.getByTestId('visible-site').nth(0), reading.getByTestId('visible-site').last())

  // The dragged tab — not one of its neighbours — has to be the one that moves.
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: {
      bookmarks: [{
        uuid: 'session-reading',
        sites: [{ title: 'GitHub Actions' }, { title: 'OpenAI' }]
      }]
    }
  })
  // The emptied source is saved too, otherwise the tab reappears on refresh.
  const sourceUpdate = await page.evaluate(() => window.__tabspaceBridgeCommands
    .filter(command => command.name === 'UpdateSession')
    .map(command => command.payload.bookmarks[0])
    .find(bookmark => bookmark.uuid === 'session-research'))
  expect(sourceUpdate.sites.map(site => site.title)).toEqual(['Cloudflare Pages'])

  await expect(reading.getByTestId('visible-site')).toHaveCount(2)
  await expect(research.getByTestId('visible-site')).toHaveCount(1)
  await expect(research).not.toContainText('OpenAI')
})

test('uses the merge shortcut to select all tabs and merge session tags', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  const research = page.getByTestId('session-session-research')
  await research.hover()
  await research.getByTestId('merge-session').click()
  await expect(research.getByTestId('selected-tabs-count')).toHaveText('2 selected')
  await expect(research.getByTestId('toggle-select-all')).toHaveText('Deselect all')
  await expect(research.getByTestId('bulk-merge-hint')).toHaveText('Session tags will also be merged.')
  await expect(research.getByTestId('bulk-move-submit')).toHaveText('Merge')

  await research.getByTestId('bulk-move-target').selectOption('session-reading')
  await research.getByTestId('bulk-move-submit').click()

  await expect.poll(() => lastBridgeCommand(page, 'MergeSessions')).toMatchObject({
    payload: {
      bookmarks: [
        { uuid: 'session-reading' },
        { uuid: 'session-research' }
      ]
    }
  })
  expect(await bridgeCommandCount(page, 'DeleteSession')).toBe(0)
  await expect(research).toHaveCount(0)
  const reading = page.getByTestId('session-session-reading')
  await expect(reading.getByTestId('visible-site')).toHaveCount(3)
  await expect(reading.locator('.tag', { hasText: 'Work' })).toBeVisible()
})

test('loads, searches, filters and counts sessions', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await expect(page.getByTestId('session-session-research')).toContainText('Cloudflare Pages')
  await expect(page.getByTestId('session-stats')).toContainText('2 sessions')
  await expect(page.getByTestId('session-stats')).toContainText('3 tabs')

  await page.evaluate(() => document.fonts.ready)
  const dashboardLayout = await page.evaluate(() => {
    const title = document.querySelector('#title h1').getBoundingClientRect()
    const firstCard = document.querySelector('.session').getBoundingClientRect()
    const search = document.querySelector('#keyword').getBoundingClientRect()
    const bodyStyle = getComputedStyle(document.body)
    return {
      title: { x: title.x, y: title.y },
      firstCard: { x: firstCard.x },
      search: { y: search.y },
      backgroundAttachment: bodyStyle.backgroundAttachment,
      backgroundRepeat: bodyStyle.backgroundRepeat
    }
  })
  expect(Math.abs(dashboardLayout.title.x - dashboardLayout.firstCard.x)).toBeLessThanOrEqual(1)
  expect(dashboardLayout.title.y).toBeLessThan(dashboardLayout.search.y)
  expect(dashboardLayout.backgroundAttachment).toBe('fixed, fixed')
  expect(dashboardLayout.backgroundRepeat).toBe('no-repeat, no-repeat')

  await page.locator('#keyword').fill('cloudflare')
  await expect(page.locator('.session')).toHaveCount(1)
  const searchResult = page.getByTestId('session-session-research')
  await expect(searchResult).toContainText('Research')
  await expect(searchResult.getByTestId('visible-site')).toHaveCount(1)
  await expect(searchResult).toContainText('Cloudflare Pages')
  await expect(searchResult).not.toContainText('OpenAI')
  await expect(searchResult.getByTestId('search-match-count')).toContainText('1 / 2 tabs')
  await expect(page.getByTestId('session-stats')).toContainText('1 tab')

  const searchRowAlignment = await searchResult.getByTestId('visible-site').evaluate(element => ({
    titleX: element.querySelector('.site-title .link').getBoundingClientRect().x,
    urlX: element.querySelector('.site-url').getBoundingClientRect().x
  }))
  expect(Math.round(searchRowAlignment.urlX)).toBe(Math.round(searchRowAlignment.titleX))

  // The match count is the expander here; the card carries no separate button.
  await expect(searchResult.getByTestId('toggle-session-expansion')).toHaveCount(0)
  const searchExpansion = searchResult.getByTestId('search-match-count')
  await expect(searchExpansion).toHaveAttribute('aria-label', 'Expand session')
  await searchExpansion.click()
  await expect(searchResult.getByTestId('visible-site')).toHaveCount(2)
  await expect(searchResult).toContainText('OpenAI')
  await expect(searchExpansion).toHaveAttribute('aria-label', 'Collapse session')
  await searchExpansion.click()
  await expect(searchResult.getByTestId('visible-site')).toHaveCount(1)
  await expect(searchResult).not.toContainText('OpenAI')

  await page.locator('#keyword').fill('')
  await expect(page.locator('.session')).toHaveCount(2)
  await expect(searchResult.getByTestId('visible-site')).toHaveCount(2)
  await expect(searchResult.getByTestId('search-match-count')).toHaveCount(0)
  await expect(page.getByTestId('session-stats')).toContainText('3 tabs')

  await searchResult.hover()
  await searchResult.getByTestId('toggle-favorite').click()
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: { bookmarks: [{ comment: '' }] }
  })

  await page.getByTestId('filter-Work').click()
  await expect(page.getByTestId('session-session-research')).toBeVisible()
  await expect(page.getByTestId('session-session-reading')).toBeHidden()
  await page.getByTestId('filter-untagged').click()
  await expect(page.getByTestId('session-session-reading')).toBeVisible()
  await expect(page.getByTestId('session-session-research')).toBeHidden()
  await page.getByTestId('filter-all').click()
  await expect(page.locator('.session')).toHaveCount(2)
})

test('connects localhost through the Safari App Extension DOM bridge', async ({ page }) => {
  await openAppExtensionDashboard(page, sessions)

  await expect(page.locator('.session')).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => window.__tabspace_bridge)).toBeUndefined()
  await expect.poll(() => bridgeCommandCount(page, 'CheckBookmarks')).toBeGreaterThan(0)
  await page.waitForTimeout(1200)
  await expect(page.locator('#bridgeStorage')).toHaveCount(0)
})

test('falls back to the legacy iframe bridge used by build 89', async ({ page }) => {
  const serializedSessions = JSON.stringify(sessions).replace(/</g, '\\u003c')
  await page.route('**/storage.html?method=get', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><script>
      const sessions = ${serializedSessions}
      window.addEventListener('message', event => {
        if (!event.data || event.data.cmd !== 'CheckDefault') return
        parent.postMessage({
          cmd: 'ReturnDefault',
          id: event.data.name,
          value: event.data.name === 'tabspace-native-protocol-version' ? '1' : ''
        }, '*')
      })
      setTimeout(() => parent.postMessage({
        cmd: 'ReturnBookmarks',
        bookmarks: JSON.stringify(sessions)
      }, '*'), 50)
    <\/script>`
  }))
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }))
  await page.goto('http://localhost:47317/')

  await expect(page.locator('#bridgeStorage')).toHaveAttribute(
    'src',
    'https://static.mytab.space/storage.html?method=get'
  )
  await expect(page.locator('.session')).toHaveCount(2)
  await expect(page.getByTestId('session-session-research')).toBeVisible()
})

test('finds and safely deletes matches at the end of a session with thousands of tabs', async ({ page }) => {
  const sites = Array.from({ length: 5000 }, (_, index) => ({
    title: `Archived tab ${index + 1}`,
    url: `https://example.com/archive/${index + 1}`
  }))
  sites[2500] = { title: 'Middle needle reference', url: 'https://example.com/middle' }
  sites[4999] = { title: 'Needle at end', url: 'https://example.com/end' }

  const largeSession = {
    uuid: 'session-large',
    title: 'Large archive',
    timestamp: 1767225600000,
    comment: 'Keep this note',
    sites,
    tags: [{ name: 'Archive' }]
  }

  await openDashboard(page, { initialSessions: [largeSession], collapseSessions: true })
  const card = page.getByTestId('session-session-large')
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(10)
  await expect(card.getByTestId('collapsed-site-overflow')).toHaveText('+4990')

  await page.locator('#keyword').fill('needle')
  await expect(card.getByTestId('visible-site')).toHaveCount(2)
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(0)
  await expect(card.getByTestId('search-match-count')).toContainText('2 / 5000 tabs')
  await expect(page.getByTestId('session-stats')).toContainText('2 tabs')
  await expect(card.getByTestId('visible-site').first()).toContainText('Needle at end')

  const firstMatch = card.getByTestId('visible-site').first()
  await firstMatch.hover()
  await firstMatch.locator('.del-item').click()
  await expect.poll(() => page.evaluate(() => {
    const commands = window.__tabspaceBridgeCommands.filter(command => command.name === 'UpdateSession')
    const sitesInUpdate = commands.at(-1)?.payload?.bookmarks?.[0]?.sites || []
    return {
      count: sitesInUpdate.length,
      keptMiddleMatch: sitesInUpdate.some(site => site.title === 'Middle needle reference'),
      removedEndMatch: !sitesInUpdate.some(site => site.title === 'Needle at end'),
      comment: commands.at(-1)?.payload?.bookmarks?.[0]?.comment
    }
  })).toEqual({ count: 4999, keptMiddleMatch: true, removedEndMatch: true, comment: 'Keep this note' })

  await expect(card.getByTestId('visible-site')).toHaveCount(1)
  await expect(card.getByTestId('search-match-count')).toContainText('1 / 4999 tabs')

  await page.locator('#keyword').fill('')
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(10)
  await expect(card.getByTestId('collapsed-site-overflow')).toHaveText('+4989')
})

test('renders highlighted titles as text instead of executable HTML', async ({ page }) => {
  const unsafeSession = {
    uuid: 'session-untrusted-title',
    title: '<strong>Needle session</strong>',
    timestamp: 1767225600000,
    comment: '',
    sites: [{
      title: '<img src=x onerror="throw new Error(\'unsafe title executed\')"> Needle page',
      url: 'https://example.com/needle'
    }],
    tags: [{ name: '<em>Needle tag</em>' }]
  }

  await openDashboard(page, { initialSessions: [unsafeSession] })
  await page.locator('#keyword').fill('needle')

  const card = page.getByTestId('session-session-untrusted-title')
  await expect(card.locator('.session-title strong')).toHaveCount(0)
  await expect(card.locator('.site-title img')).toHaveCount(0)
  await expect(card.locator('.tag em')).toHaveCount(0)
  await expect(card.locator('.highlight')).toHaveCount(4)
  await expect(card).toContainText('<img src=x')
})

test('collapses session favicons into an iOS-style stack after ten tabs', async ({ page }) => {
  const manyTabsSession = {
    ...sessions[0],
    uuid: 'session-many-tabs',
    sites: Array.from({ length: 12 }, (_, index) => ({
      title: `Tab ${index + 1}`,
      url: `https://example${index + 1}.com`
    }))
  }
  const tenTabsSession = {
    ...manyTabsSession,
    uuid: 'session-ten-tabs',
    sites: manyTabsSession.sites.slice(0, 10)
  }

  await openDashboard(page, { initialSessions: [manyTabsSession, tenTabsSession] })
  await page.getByTestId('toggle-collapse').click()
  await page.getByTestId('toggle-collapse').click()

  const card = page.getByTestId('session-session-many-tabs')
  const icons = card.getByTestId('collapsed-site-icon')
  await expect(icons).toHaveCount(10)
  await expect(card.getByTestId('collapsed-site-overflow')).toHaveText('+2')
  await expect(card.locator('.site-title')).toHaveCount(0)
  await expect(page.getByTestId('session-session-ten-tabs').getByTestId('collapsed-site-overflow')).toHaveCount(0)
  await expect.poll(() => icons.first().evaluate(element => getComputedStyle(element).borderRadius)).toBe('50%')

  // A collapsed card has no expand button: clicking its empty space expands it,
  // and the favicon row is the matching keyboard control.
  await expect(card.getByTestId('toggle-session-expansion')).toHaveCount(0)
  const sessionExpansion = card.getByTestId('site-list')
  await expect(sessionExpansion).toHaveAttribute('data-expander', 'true')
  await expect(sessionExpansion).toHaveAttribute('aria-label', 'Expand session')
  await card.locator('.session-header').click()
  await expect(card.getByTestId('visible-site')).toHaveCount(12)
  await expect(card.locator('.site-title')).toHaveCount(12)
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(0)
  await expect(sessionExpansion).toHaveAttribute('aria-label', 'Collapse session')
  await expect(page.getByTestId('session-session-ten-tabs').getByTestId('collapsed-site-icon')).toHaveCount(10)
  await sessionExpansion.focus()
  await sessionExpansion.press('Enter')
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(10)
  await expect(card.locator('.site-title')).toHaveCount(0)
  await sessionExpansion.press('Space')
  await expect(card.getByTestId('visible-site')).toHaveCount(12)
  await card.locator('.session-header').click()
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(10)
  await expect.poll(() => icons.first().evaluate(element => getComputedStyle(element).borderRadius)).toBe('50%')

  const iconStyle = await icons.first().evaluate(element => {
    const style = getComputedStyle(element)
    const faviconStyle = getComputedStyle(element.querySelector('img'))
    return {
      width: style.width,
      height: style.height,
      borderRadius: style.borderRadius,
      faviconWidth: faviconStyle.width,
      faviconHeight: faviconStyle.height
    }
  })
  expect(iconStyle).toEqual({
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    faviconWidth: '16px',
    faviconHeight: '16px'
  })

  const firstBox = await icons.nth(0).boundingBox()
  const secondBox = await icons.nth(1).boundingBox()
  const faviconBox = await icons.nth(0).locator('img').boundingBox()
  const overflowBox = await card.getByTestId('collapsed-site-overflow').boundingBox()
  const titleBox = await card.locator('.session-title').boundingBox()
  expect(Math.round(secondBox.x - firstBox.x)).toBe(20)
  expect(Math.round(firstBox.x)).toBe(Math.round(titleBox.x))
  expect(Math.round(faviconBox.x + faviconBox.width / 2)).toBe(Math.round(firstBox.x + firstBox.width / 2))
  expect(Math.round(faviconBox.y + faviconBox.height / 2)).toBe(Math.round(firstBox.y + firstBox.height / 2))
  expect(Math.round(overflowBox.y)).toBe(Math.round(firstBox.y))
  expect(Math.round(overflowBox.height)).toBe(Math.round(firstBox.height))
  await expect(card.locator('.collapsed-fav-img').first()).toHaveAttribute('src', /icon-webpage/)

  await expect.poll(() => page.evaluate(() => localStorage.getItem('tabspace-session-cards-collapsed'))).toBe('true')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tabspace-session-cards-view-mode'))).toBe('compact')
  await page.reload()
  await expect(page.getByTestId('session-session-many-tabs').getByTestId('collapsed-site-icon')).toHaveCount(10)
  await expect(page.getByTestId('session-session-many-tabs').getByTestId('collapsed-site-overflow')).toHaveText('+2')
})

test('cycles through expanded, titles-only and compact session views', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  const toggle = page.getByTestId('toggle-collapse')
  await expect(toggle).toHaveAttribute('data-view-mode', 'expanded')
  await expect(toggle).toHaveAttribute('aria-label', 'Switch session view: Expanded')
  await expect(page.getByTestId('session-session-research').getByTestId('site-list'))
    .toHaveAttribute('data-site-drag-enabled', 'true')

  // Hovering the trigger names each view, so the cycle is not icon-only guesswork.
  await page.getByTestId('view-mode-menu').hover()
  await expect(page.getByTestId('view-mode-expanded')).toHaveText('Expanded')
  await expect(page.getByTestId('view-mode-expanded')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('view-mode-compact')).toHaveText('Compact')
  await expect(page.getByTestId('view-mode-titles')).toHaveText('Titles only')
  await page.getByTestId('view-mode-compact').click()
  await expect(toggle).toHaveAttribute('data-view-mode', 'compact')
  await expect(toggle).toHaveAttribute('aria-label', 'Switch session view: Compact')
  await page.getByTestId('view-mode-menu').hover()
  await page.getByTestId('view-mode-expanded').click()
  await expect(toggle).toHaveAttribute('data-view-mode', 'expanded')

  await toggle.click()
  await expect(toggle).toHaveAttribute('data-view-mode', 'titles')
  const titlesCard = page.getByTestId('titles-only-session-card')
  const researchRow = titlesCard.getByTestId('session-session-research')
  const readingRow = titlesCard.getByTestId('session-session-reading')
  await expect(page.locator('.session')).toHaveCount(1)
  await expect(researchRow.locator('.titles-only-session-title')).toHaveText('Research')
  await expect(readingRow.locator('.titles-only-session-title')).toHaveText('Reading list')
  await expect(researchRow.getByTestId('titles-only-session-count')).toHaveText('2 tabs')
  await expect(readingRow.getByTestId('titles-only-session-count')).toHaveText('1 tab')
  await expect.poll(() => researchRow.locator('.titles-only-session-title').evaluate(element => getComputedStyle(element).fontWeight)).toBe('400')
  const researchExpansionControl = researchRow.getByTestId('toggle-titles-only-session')
  await expect(researchExpansionControl.locator('svg')).toHaveCount(0)
  await expect.poll(() => researchExpansionControl.evaluate(element => getComputedStyle(element).position)).toBe('absolute')
  await expect.poll(() => researchExpansionControl.evaluate(element => getComputedStyle(element).cursor)).toBe('default')

  await researchRow.evaluate(row => {
    window.__titlesOnlyExpandStartedClipped = false
    const observer = new MutationObserver(() => {
      const details = row.querySelector('[data-testid="titles-only-session-details"]')
      if (details) {
        window.__titlesOnlyExpandStartedClipped = getComputedStyle(details).overflow === 'hidden'
          && details.getBoundingClientRect().height <= 1
        observer.disconnect()
      }
    })
    observer.observe(row, { childList: true, subtree: true })
  })
  await researchRow.locator('.titles-only-session-spacer').click()
  const researchDetails = researchRow.getByTestId('titles-only-session-details')
  await expect.poll(() => page.evaluate(() => window.__titlesOnlyExpandStartedClipped)).toBe(true)
  await expect.poll(() => researchDetails.evaluate(element => Math.max(...getComputedStyle(element).transitionDuration
    .split(',')
    .map(duration => Number.parseFloat(duration))))).toBe(0.2)
  await expect.poll(() => researchDetails.evaluate(element => getComputedStyle(element).overflow)).toBe('hidden')
  await expect(researchRow.getByTestId('visible-site')).toHaveCount(2)
  await expect(researchRow.getByTestId('site-list')).toHaveAttribute('data-site-drag-enabled', 'false')
  await expect(researchRow).toContainText('OpenAI')
  await researchExpansionControl.focus()
  await researchExpansionControl.press('Space')
  await expect(researchRow.getByTestId('visible-site')).toHaveCount(0)
  await researchExpansionControl.press('Enter')
  await expect(researchRow.getByTestId('visible-site')).toHaveCount(2)
  await expect(researchRow.getByTestId('edit-session')).toHaveCount(0)
  await expect(researchRow.getByTestId('add-tag')).toHaveCount(1)
  await expect(researchRow.getByTestId('toggle-favorite')).toHaveCount(1)
  await expect(researchRow.getByTestId('pin-session')).toHaveCount(1)

  const firstTab = researchRow.getByTestId('visible-site').first()
  await firstTab.hover()
  await firstTab.locator('.del-item').click()
  await expect(researchRow.getByTestId('visible-site')).toHaveCount(1)
  await expect(researchRow.getByTestId('titles-only-session-count')).toHaveText('1 tab')

  await readingRow.locator('.titles-only-session-spacer').click()
  await expect(researchRow.getByTestId('visible-site')).toHaveCount(0)
  await expect(readingRow.getByTestId('visible-site')).toHaveCount(1)

  const readingTitle = readingRow.locator('.titles-only-session-title')
  await readingTitle.click()
  await expect.poll(() => readingTitle.evaluate(element => getComputedStyle(element).boxShadow)).toContain('rgb(250, 128, 114)')
  await readingTitle.fill('Reading later')
  await readingTitle.press('Enter')
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: { bookmarks: [{ uuid: 'session-reading', title: 'Reading later' }] }
  })
  await expect(readingRow.getByTestId('toggle-titles-only-session')).toHaveAttribute('aria-expanded', 'true')

  await readingRow.getByTestId('merge-session').click()
  await expect(readingRow.getByTestId('bulk-move-bar')).toBeVisible()
  await expect(readingRow.getByTestId('selected-tabs-count')).toHaveText('1 selected')
  await expect(readingRow.getByTestId('bulk-merge-hint')).toBeVisible()
  await readingRow.getByTestId('cancel-bulk-select').click()
  await expect(readingRow.getByTestId('bulk-move-bar')).toHaveCount(0)

  await titlesCard.evaluate(card => {
    window.__titlesOnlyMoveObserved = false
    window.__titlesOnlyMoveDuration = 0
    const observer = new MutationObserver(() => {
      const movingSession = card.querySelector('.titles-only-session.session-move')
      if (movingSession) {
        window.__titlesOnlyMoveObserved = true
        window.__titlesOnlyMoveDuration = Math.max(...getComputedStyle(movingSession).transitionDuration
          .split(',')
          .map(duration => Number.parseFloat(duration)))
        observer.disconnect()
      }
    })
    observer.observe(card, { attributes: true, attributeFilter: ['class'], subtree: true })
  })
  await readingRow.getByTestId('pin-session').click()
  await expect.poll(() => lastBridgeCommand(page, 'UpSession')).toMatchObject({
    payload: { bookmarks: [{ uuid: 'session-reading' }] }
  })
  await expect.poll(() => page.evaluate(() => window.__titlesOnlyMoveObserved)).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__titlesOnlyMoveDuration)).toBe(0.2)
  await expect(titlesCard.locator('.titles-only-session').first()).toHaveAttribute('data-testid', 'session-session-reading')

  await researchRow.getByTestId('restore-session').click()
  await expect.poll(() => lastBridgeCommand(page, 'RestoreSession')).toMatchObject({
    payload: { bookmarks: [{ uuid: 'session-research' }] }
  })
  await expect.poll(() => page.evaluate(() => window.__tabspaceRestoredSessions)).toEqual(['session-research'])
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tabspace-session-cards-view-mode'))).toBe('titles')

  await page.reload()
  await expect(page.getByTestId('toggle-collapse')).toHaveAttribute('data-view-mode', 'titles')
  await expect(page.locator('.session')).toHaveCount(1)

  await page.getByTestId('toggle-collapse').click()
  await expect(page.getByTestId('toggle-collapse')).toHaveAttribute('data-view-mode', 'compact')
  await expect(page.getByTestId('session-session-research').getByTestId('collapsed-site-icon')).toHaveCount(2)
  await expect(page.getByTestId('session-session-research').getByTestId('site-list'))
    .toHaveAttribute('data-site-drag-enabled', 'false')

  await page.getByTestId('toggle-collapse').click()
  await expect(page.getByTestId('toggle-collapse')).toHaveAttribute('data-view-mode', 'expanded')
  await expect(page.locator('.session')).toHaveCount(2)
  await expect(page.getByTestId('session-session-research').getByTestId('visible-site')).toHaveCount(2)
  await expect(page.getByTestId('session-session-research').getByTestId('site-list'))
    .toHaveAttribute('data-site-drag-enabled', 'true')
})

test('creates a session and appends it through the native bridge', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await page.getByTestId('add-session').click()
  const newCard = page.locator('.session').first()
  await expect(newCard).toHaveClass(/session-editing/)
  await expect(newCard.getByTestId('session-title-input')).toBeFocused()
  await newCard.locator('.tab-edit').nth(0).fill('https://example.com/new')
  await newCard.locator('.tab-edit').nth(1).fill('New tab')
  await newCard.getByTestId('save-session').click()

  await expect.poll(() => lastBridgeCommand(page, 'AppendSessions')).toMatchObject({
    payload: {
      bookmarks: [{ sites: [{ title: 'New tab', url: 'https://example.com/new' }] }]
    }
  })
  await expect(page.locator('.session')).toHaveCount(3)
  await expect(page.locator('.session').first()).toContainText('New tab')
})

test('offers an upgrade instead of a sixth session on Free', async ({ page }) => {
  const fullLibrary = Array.from({ length: 5 }, (_, index) => ({
    ...sessions[0],
    uuid: `session-${index}`,
    title: `Session ${index}`,
    tags: []
  }))
  await openDashboard(page, {
    initialSessions: fullLibrary,
    nativeProtocolVersion: '2',
    entitlementTier: 'free'
  })
  const appendCount = await bridgeCommandCount(page, 'AppendSessions')

  await page.getByTestId('add-session').click()

  // The native side would refuse the save, so no card is offered for editing
  // and nothing is sent: a refused session must never look stored.
  await expect(page.getByTestId('plan-comparison')).toBeVisible()
  await expect(page.locator('.session')).toHaveCount(5)
  await expect(page.locator('.session-editing')).toHaveCount(0)
  expect(await bridgeCommandCount(page, 'AppendSessions')).toBe(appendCount)
})

test('drops the new session card when the native side reports the Free limit', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: sessions,
    nativeProtocolVersion: '2',
    entitlementTier: 'free'
  })

  await page.getByTestId('add-session').click()
  const newCard = page.locator('.session').first()
  await newCard.locator('.tab-edit').nth(0).fill('https://example.com/new')
  await newCard.locator('.tab-edit').nth(1).fill('New tab')
  // The native side owns the verdict: reply as it does when the library filled
  // up elsewhere between opening the editor and saving.
  await page.evaluate(() => window.__tabspaceTest.emit('SessionLimitReached', { limit: 5 }))

  await expect(page.getByTestId('plan-comparison')).toBeVisible()
  await expect(page.locator('.session')).toHaveCount(2)
  await expect(page.locator('.session').first()).not.toContainText('New tab')
})

test('edits a complete session with modern controls and can cancel or save', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })
  const card = page.getByTestId('session-session-research')
  const updateCount = await bridgeCommandCount(page, 'UpdateSession')

  await card.hover()
  await card.getByTestId('edit-session').click()
  await expect(card).toHaveClass(/session-editing/)
  await expect(card.getByTestId('session-title-input')).toBeFocused()
  await expect(card.getByTestId('cancel-session-edit')).toBeVisible()
  await expect(card.getByTestId('save-session')).toHaveText('Save changes')
  await expect(card.getByTestId('restore-session')).toHaveCount(0)
  await expect(card.getByTestId('delete-session')).toHaveCount(0)
  await expect(card.getByTestId('export-session-menu')).toHaveCount(0)
  await expect(card.getByTestId('add-tag')).toHaveCount(0)
  await expect(card.getByTestId('toggle-favorite')).toHaveCount(0)
  await expect(card.getByTestId('edit-site-url')).toHaveCount(2)
  await expect(card.getByTestId('edit-site-title')).toHaveCount(2)
  await expect.poll(() => card.getByTestId('save-session').evaluate(element => getComputedStyle(element).minHeight))
    .toBe('34px')

  await card.getByTestId('session-title-input').fill('Discarded title')
  await card.getByTestId('edit-site-title').first().fill('Discarded tab')
  await card.getByTestId('remove-edit-site').nth(1).click()
  await card.getByTestId('add-edit-site').click()
  await expect(card.getByTestId('edit-site-url')).toHaveCount(2)
  await card.getByTestId('cancel-session-edit').click()

  await expect(card).not.toHaveClass(/session-editing/)
  await expect(card.locator('.session-title')).toHaveText('Research')
  await expect(card.getByTestId('visible-site')).toHaveCount(2)
  await expect(card).toContainText('OpenAI')
  await expect(card).toContainText('Cloudflare Pages')
  await expect.poll(() => bridgeCommandCount(page, 'UpdateSession')).toBe(updateCount)

  await card.hover()
  await card.getByTestId('edit-session').click()
  await card.getByTestId('session-title-input').fill('Modern research')
  await card.getByTestId('edit-site-title').first().fill('OpenAI home')
  await card.getByTestId('add-edit-site').click()
  await card.getByTestId('edit-site-url').last().fill('https://example.com/reference')
  await card.getByTestId('session-title-input').press('Control+Enter')

  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: {
      bookmarks: [{
        uuid: 'session-research',
        title: 'Modern research',
        sites: [
          { title: 'OpenAI home', url: 'https://openai.com' },
          { title: 'Cloudflare Pages', url: 'https://developers.cloudflare.com/pages/' },
          { title: 'https://example.com/reference', url: 'https://example.com/reference' }
        ]
      }]
    }
  })
  await expect(card).not.toHaveClass(/session-editing/)
  await expect(card.locator('.session-title')).toHaveText('Modern research')
})

test('edits a session and sends changes through the native bridge', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })
  const card = page.getByTestId('session-session-research')
  await card.hover()

  const title = card.locator('.session-title')
  await title.click()
  await title.fill('Renamed research')
  await title.press('Enter')
  await expect(title).toHaveText('Renamed research')
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: { bookmarks: [{ title: 'Renamed research' }] }
  })

  await card.hover()
  await card.locator('.del-item').first().click()
  await expect(card.locator('.session-sites li')).toHaveCount(1)
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: { bookmarks: [{ sites: [{ title: 'Cloudflare Pages' }] }] }
  })

  await card.hover()
  await card.getByTestId('add-tag').click()
  const tagInput = card.getByTestId('tag-input')
  await tagInput.fill('Project')
  await expect(tagInput).toHaveValue('Project')
  await tagInput.press('Tab')
  await expect(card.locator('.tag', { hasText: 'Project' })).toBeVisible()
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: { bookmarks: [{ tags: [{ name: 'Work' }, { name: 'Project' }] }] }
  })
})

test('suggests existing tags and supports pointer and keyboard selection', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: [
      { ...sessions[0], tags: [{ name: 'Work' }, { name: 'Personal' }] },
      sessions[1]
    ]
  })
  const reading = page.getByTestId('session-session-reading')

  await reading.hover()
  await reading.getByTestId('add-tag').click()
  let tagInput = reading.getByTestId('tag-input')
  await tagInput.fill('Prs')
  await reading.getByRole('option', { name: 'Personal' }).click()
  await expect(reading.locator('.tag', { hasText: 'Personal' })).toBeVisible()

  await reading.hover()
  await reading.getByTestId('add-tag').click()
  tagInput = reading.getByTestId('tag-input')
  const workOption = reading.getByRole('option', { name: 'Work' })

  await expect(tagInput).toBeFocused()
  await expect(workOption).toBeVisible()
  await tagInput.fill('Wr')
  await expect(workOption).toBeVisible()
  await tagInput.press('ArrowDown')
  await expect(workOption).toHaveAttribute('aria-selected', 'true')
  await tagInput.press('Enter')

  await expect(reading.locator('.tag', { hasText: 'Work' })).toBeVisible()
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: {
      bookmarks: [{
        uuid: 'session-reading',
        tags: [{ name: 'Personal' }, { name: 'Work' }]
      }]
    }
  })
})

test('restores, favorites, reorders, trashes and permanently deletes sessions', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })
  const research = page.getByTestId('session-session-research')

  await research.getByTestId('restore-session').click()
  await expect.poll(() => lastBridgeCommand(page, 'RestoreSession')).toMatchObject({
    payload: { bookmarks: [{ uuid: 'session-research' }] }
  })

  await research.hover()
  await research.getByTestId('toggle-favorite').click()
  // @Favorite is a system tag: no pill on the card, but the sidebar gains a Favorite filter
  await expect(research.locator('.tag', { hasText: '@Favorite' })).toHaveCount(0)
  await expect(page.getByTestId('filter-@Favorite')).toBeVisible()
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: { bookmarks: [{ uuid: 'session-research', tags: [{ name: 'Work' }, { name: '@Favorite' }] }] }
  })

  const reading = page.getByTestId('session-session-reading')
  await reading.hover()
  await reading.getByTestId('pin-session').click()
  await expect(page.locator('.session').first()).toHaveAttribute('id', 'session-reading')
  await expect.poll(() => lastBridgeCommand(page, 'UpSession')).toMatchObject({
    payload: { bookmarks: [{ uuid: 'session-reading' }] }
  })

  await research.getByTestId('delete-session').click()
  await expect(research).toBeHidden()
  const sidebarFilterOrder = await page.locator('.session-sidebar > .tag-filter').evaluateAll(filters => (
    filters.map(filter => filter.getAttribute('data-testid'))
  ))
  expect(sidebarFilterOrder.indexOf('filter-@Trash')).toBe(
    sidebarFilterOrder.indexOf('filter-untagged') + 1
  )
  await page.getByTestId('filter-@Trash').click()
  await expect(research).toBeVisible()
  await expect(page.getByTestId('export-menu')).toHaveCount(0)
  await expect(research.getByTestId('export-session-menu')).toHaveCount(0)
  await page.getByTestId('empty-trash').click()
  await expect(research).toHaveCount(0)
  await expect.poll(() => lastBridgeCommand(page, 'DeleteSession')).toMatchObject({
    payload: { bookmarks: [{ uuid: 'session-research' }] }
  })
})

test('refreshes sessions after a native remote-change notification', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })
  const initialChecks = await bridgeCommandCount(page, 'CheckBookmarks')

  await page.evaluate(() => {
    window.__tabspaceTest.setSessions([{
      uuid: 'session-synced',
      title: 'Synced from another device',
      timestamp: 1767398400000,
      comment: '',
      sites: [{ title: 'Synced tab', url: 'https://example.com/synced' }],
      tags: []
    }])
    window.__tabspaceTest.emit('SessionsChangedRemotely')
  })

  await expect(page.getByTestId('session-session-synced')).toBeVisible()
  await expect(page.getByTestId('session-session-research')).toHaveCount(0)
  await expect.poll(() => bridgeCommandCount(page, 'CheckBookmarks')).toBeGreaterThan(initialChecks)
})

test('shows a safe empty state when there are no sessions', async ({ page }) => {
  await openDashboard(page, { initialSessions: [] })

  await expect(page.locator('.empty-state')).toHaveText('No saved sessions yet.')
  await expect(page.getByTestId('session-stats')).toContainText('0 sessions')
  await expect(page.getByTestId('session-stats')).toContainText('0 tabs')
})

test('keeps the dashboard stable when native bookmarks are malformed', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: sessions,
    malformedBookmarks: true,
    expectedSessionCount: null
  })

  await expect(page.getByText('Loading sessions...')).toBeVisible()
  await expect(page.locator('.session')).toHaveCount(0)
  await expect.poll(() => lastBridgeCommand(page, 'CheckBookmarks')).not.toBeNull()
})

test('directs visitors without the app to the Tab Space website', async ({ page }) => {
  await page.route('**/storage.html?method=get', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Bridge fallback</title>'
  }))
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }))
  await page.goto('/')

  await expect.poll(() => page.evaluate(() => window.location.hostname)).toBe('localhost')
  await expect(page.getByText('Connecting to Tab Space...')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tab Space Helper not detected' })).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('extension-permission-hint')).toHaveText(
    'Click the Tab Space extension button in Safari and choose “Always Allow on Every Website”; otherwise, Tab Space cannot access your tabs.'
  )
  await expect(page.getByRole('link', { name: 'Get Tab Space' })).toHaveAttribute('href', 'https://mytab.space')
  await expect(page.getByTestId('export-menu')).toHaveCount(0)
})

test('offers the bundled dashboard only when an old app exposes it', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: sessions,
    malformedBookmarks: true,
    expectedSessionCount: null,
    bundledDashboard: true
  })

  const bundledDashboard = page.getByRole('button', { name: 'Open bundled dashboard' })
  await expect(bundledDashboard).toBeVisible({ timeout: 10000 })
  await bundledDashboard.click()
  await expect.poll(() => page.evaluate(() => window.__tabspaceBundledDashboardOpened)).toBe(true)
})

test('links support, FAQ and privacy to the official website', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await expect(page.getByTestId('changelog-link')).toHaveAttribute('href', 'https://mytab.space/changelog.html')
  let footer = page.locator('footer')
  await expect(footer.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'mailto:support@mytab.space')
  await expect(footer.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', 'https://mytab.space/#faq')
  await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'https://mytab.space/privacy.html')

  await page.getByTestId('settings-link').click()
  await expect(page).toHaveURL(/#\/settings$/)
  footer = page.locator('footer')
  await expect(footer.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'mailto:support@mytab.space')
  await expect(footer.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', 'https://mytab.space/#faq')
  await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'https://mytab.space/privacy.html')
})

test('persists settings across a reload', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })
  await page.getByTestId('settings-link').click()
  await expect(page).toHaveURL(/#\/settings$/)

  const firstToggle = page.locator('.setting-item .vue-js-switch').first()
  await firstToggle.click()
  await expect.poll(() => lastBridgeCommand(page, 'SetDefault')).toMatchObject({
    payload: { name: 'ignore-pinned-tabs', value: 'true' }
  })

  await page.locator('#language-select').selectOption('zh-cn')
  await expect.poll(() => lastBridgeCommand(page, 'SetDefault')).toMatchObject({
    payload: { name: 'preferred-language', value: 'zh-cn' }
  })

  await page.locator('.inline-select').first().selectOption('Brave Browser')
  await expect.poll(() => lastBridgeCommand(page, 'SetDefault')).toMatchObject({
    payload: { name: 'externalBrowser1', value: 'Brave Browser' }
  })

  await page.reload()
  await expect(page.locator('.setting-item .vue-js-switch').first()).toHaveClass(/toggled/)
  await expect(page.locator('#language-select')).toHaveValue('zh-cn')
  await expect(page.locator('.inline-select').first()).toHaveValue('Brave Browser')
})

test('imports OneTab text and exports the resulting backup', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await page.getByTestId('import-menu').hover()
  await page.getByTestId('import-onetab').click()
  await expect(page.getByTestId('import-modal')).toBeVisible()
  await page.locator('#import-content').fill([
    'https://example.com | Example',
    'not-a-url | Invalid',
    'https://openai.com | OpenAI'
  ].join('\n'))
  await page.getByTestId('import-submit').click()

  await expect.poll(() => lastBridgeCommand(page, 'AppendSessions')).toMatchObject({
    payload: {
      bookmarks: [{
        title: 'From OneTab',
        sites: [
          { title: 'Example', url: 'https://example.com' },
          { title: 'OpenAI', url: 'https://openai.com' }
        ]
      }]
    }
  })
  await expect(page.locator('.session')).toHaveCount(3)

  await page.getByTestId('export-menu').hover()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-menu').getByTestId('export-json').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^Tab-Space-Backup-\d{4}-\d{2}-\d{2}-\d{6}\.tabspace$/)
  const exportedSessions = JSON.parse(await fs.readFile(await download.path(), 'utf8'))
  expect(exportedSessions).toHaveLength(3)
  expect(exportedSessions[0].title).toBe('From OneTab')
})

test('exports a self-contained HTML page in the current dashboard style', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await page.getByTestId('export-menu').hover()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-menu').getByTestId('export-html').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Tab-Space-Exported.html')

  const exportedHtml = await fs.readFile(await download.path(), 'utf8')
  expect(exportedHtml).toContain('<!doctype html>')
  expect(exportedHtml).not.toContain('cdn.jsdelivr.net')
  expect(exportedHtml).not.toContain('cdnjs.cloudflare.com')
  expect(exportedHtml).not.toContain('new Vue')

  await page.setContent(exportedHtml)
  await expect(page.locator('.page-header h1')).toHaveText('Tab Space')
  await expect(page.locator('.page-header .brand')).toHaveAttribute('href', 'https://mytab.space')
  await expect(page.locator('.page-header .brand-logo')).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(page.locator('.page-header .brand-cta')).toHaveText('Get Tab Space →')
  await expect(page.locator('[data-filter=""] [data-icon="layers"]')).toBeVisible()
  await expect(page.locator('[data-filter="untagged"] [data-icon="circle"]')).toBeVisible()
  await expect(page.locator('.session')).toHaveCount(2)
  await expect(page.locator('.session:visible')).toHaveCount(2)
  await expect(page.locator('[data-session-count]')).toHaveText('2')
  await expect(page.locator('[data-tab-count]')).toHaveText('3')

  await page.locator('[data-filter="Work"]').click()
  await expect(page.locator('.session:visible')).toHaveCount(1)
  await expect(page.locator('.session:visible')).toContainText('Research')

  await page.locator('.search').fill('GitHub')
  await expect(page.locator('.session:visible')).toHaveCount(0)
  await page.locator('[data-filter=""]').click()
  await expect(page.locator('.session:visible')).toHaveCount(1)
  await expect(page.locator('.session:visible')).toContainText('Reading list')

  const visualStyle = await page.evaluate(() => ({
    backgroundAttachment: getComputedStyle(document.body).backgroundAttachment,
    cardRadius: getComputedStyle(document.querySelector('.session')).borderRadius,
    tabPaddingTop: getComputedStyle(document.querySelector('.session-sites li')).paddingTop
  }))
  expect(visualStyle).toEqual({
    backgroundAttachment: 'fixed, fixed',
    cardRadius: '12px',
    tabPaddingTop: '5px'
  })
})

test('excludes trashed sessions from every export format', async ({ page }) => {
  const sessionsWithTrash = [
    {
      ...sessions[0],
      tags: [{ name: 'Work' }, { name: '@Trash' }]
    },
    sessions[1]
  ]
  await openDashboard(page, { initialSessions: sessionsWithTrash, expectedSessionCount: 1 })

  await page.getByTestId('export-menu').hover()
  let downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-menu').getByTestId('export-json').click()
  let download = await downloadPromise
  const exportedJson = JSON.parse(await fs.readFile(await download.path(), 'utf8'))
  expect(exportedJson.map(session => session.uuid)).toEqual(['session-reading'])

  await page.getByTestId('export-menu').hover()
  downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-menu').getByTestId('export-html').click()
  download = await downloadPromise
  const exportedHtml = await fs.readFile(await download.path(), 'utf8')
  expect(exportedHtml).toContain('Reading list')
  expect(exportedHtml).not.toContain('Research')

  await page.evaluate(() => {
    window.__copiedExports = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async text => window.__copiedExports.push(text)
      }
    })
  })
  await page.getByTestId('export-menu').hover()
  await page.getByTestId('export-menu').getByTestId('export-text').click()
  await page.getByTestId('export-menu').hover()
  await page.getByTestId('export-menu').getByTestId('export-markdown').click()
  const copiedExports = await page.evaluate(() => window.__copiedExports)
  expect(copiedExports).toEqual([
    'Reading list\n- GitHub Actions: https://docs.github.com/actions\n\n',
    '## Reading list\n- [GitHub Actions](https://docs.github.com/actions)\n\n'
  ])
})

test('hides exports when every session is in trash', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: [{ ...sessions[0], tags: [{ name: '@Trash' }] }],
    expectedSessionCount: 0
  })

  await expect(page.getByTestId('export-menu')).toHaveCount(0)
  await page.getByTestId('filter-@Trash').click()
  await expect(page.getByTestId('session-session-research')).toBeVisible()
  await expect(page.getByTestId('export-menu')).toHaveCount(0)
  await expect(page.getByTestId('export-session-menu')).toHaveCount(0)
})

test('uses fallback titles and escapes Markdown link text', async ({ page }) => {
  await openDashboard(page, {
    initialSessions: [{
      uuid: 'session-markdown',
      title: '',
      timestamp: 1767225600000,
      comment: '',
      sites: [
        { title: 'Docs [beta] (v2)', url: 'https://example.com/docs_(beta)' },
        { title: '', url: 'https://example.com/plain' }
      ],
      tags: []
    }]
  })

  await page.evaluate(() => {
    window.__copiedMarkdown = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async text => { window.__copiedMarkdown = text }
      }
    })
  })
  await page.getByTestId('export-menu').hover()
  const markdownButton = page.getByTestId('export-menu').getByTestId('export-markdown')
  await expect(markdownButton).toHaveJSProperty('tagName', 'BUTTON')
  await markdownButton.click()

  const markdown = await page.evaluate(() => window.__copiedMarkdown)
  expect(markdown).toMatch(/^## Saved at \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  expect(markdown).toContain('[Docs \\[beta\\] (v2)]')
  expect(markdown).toContain('[https://example.com/plain]')
  expect(markdown).not.toContain('[](')
})

test('lists, restores and creates backups through the native bridge', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions, backups })
  await expect.poll(() => lastBridgeCommand(page, 'ListBackups')).not.toBeNull()

  await page.getByTestId('backup-menu').hover()
  await page.getByTestId('view-backups').click()
  await expect(page.getByTestId('backup-modal')).toBeVisible()
  await expect(page.getByTestId('backup-modal')).toContainText('2 sessions')
  await expect(page.getByTestId('backup-modal')).toContainText('2.0 KB')

  page.once('dialog', dialog => dialog.accept())
  await page.getByTestId('restore-backup').click()
  await expect.poll(() => lastBridgeCommand(page, 'RestoreBackup')).toMatchObject({
    payload: { filename: 'backup-2026-07-15.tabspace' }
  })

  await page.getByTestId('backup-menu').hover()
  await page.getByTestId('backup-now').click()
  await expect.poll(() => lastBridgeCommand(page, 'ForceBackup')).not.toBeNull()
})

test('shows and dismisses the service-worker update prompt', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tabspace:sw-update-ready')))
  const toast = page.getByRole('status')
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Cancel' }).click()
  await expect(toast).toBeHidden()
})

test('recovers automatically when a hashed application script is served as HTML', async ({ page }) => {
  let poisonedResponseSent = false

  await page.route(/\/js\/app\.[^/]+\.js$/, route => {
    if (!poisonedResponseSent) {
      poisonedResponseSent = true
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff'
        },
        body: '<!doctype html><title>Transient asset fallback</title>'
      })
    }
    return route.continue()
  })

  await openDashboard(page, { initialSessions: sessions })

  await expect(page.getByTestId('session-session-research')).toBeVisible()
  expect(poisonedResponseSent).toBe(true)

  const errors = runtimeErrors.get(page)
  expect(errors.some(message => /MIME type|Refused to execute/i.test(message))).toBe(true)
  errors.length = 0
})
