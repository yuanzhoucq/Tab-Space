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

  await page.addInitScript(({ testSessions, testBackups, malformedBookmarks, bundledDashboard, collapseSessions }) => {
    const clone = value => JSON.parse(JSON.stringify(value))
    const settingsKey = 'tabspace-e2e-settings'
    if (collapseSessions) localStorage.setItem('tabspace-session-cards-collapsed', 'true')
    const storedSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}')
    let currentSessions = clone(testSessions)

    window.__tabspaceBridgeCommands = []

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
            value: storedSettings[payload.name] || ''
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
        }
      }
    }

    if (bundledDashboard) {
      nativeBridge.fallbackToBundled = () => {
        window.__tabspaceBundledDashboardOpened = true
      }
    }

    window.__tabspace_bridge = nativeBridge
  }, {
    testSessions: initialSessions,
    testBackups: options.backups || [],
    malformedBookmarks: Boolean(options.malformedBookmarks),
    bundledDashboard: Boolean(options.bundledDashboard),
    collapseSessions: Boolean(options.collapseSessions)
  })

  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }))
  await page.goto('/')

  if (expectedSessionCount !== null) {
    await expect(page.locator('.session')).toHaveCount(expectedSessionCount)
  }
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

test('loads, searches, filters and counts sessions', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await expect(page.getByTestId('session-session-research')).toContainText('Cloudflare Pages')
  await expect(page.getByTestId('session-stats')).toContainText('2 sessions')
  await expect(page.getByTestId('session-stats')).toContainText('3 tabs')

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

  const searchExpansion = searchResult.getByTestId('toggle-session-expansion')
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
  await expect(searchResult.getByTestId('toggle-session-expansion')).toHaveCount(0)
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

  const card = page.getByTestId('session-session-many-tabs')
  const icons = card.getByTestId('collapsed-site-icon')
  await expect(icons).toHaveCount(10)
  await expect(card.getByTestId('collapsed-site-overflow')).toHaveText('+2')
  await expect(card.locator('.site-title')).toHaveCount(0)
  await expect(page.getByTestId('session-session-ten-tabs').getByTestId('collapsed-site-overflow')).toHaveCount(0)
  await expect.poll(() => icons.first().evaluate(element => getComputedStyle(element).borderRadius)).toBe('50%')

  const sessionExpansion = card.getByTestId('toggle-session-expansion')
  await expect(sessionExpansion).toHaveAttribute('aria-label', 'Expand session')
  await sessionExpansion.click()
  await expect(card.getByTestId('visible-site')).toHaveCount(12)
  await expect(card.locator('.site-title')).toHaveCount(12)
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(0)
  await expect(sessionExpansion).toHaveAttribute('aria-label', 'Collapse session')
  await expect(page.getByTestId('session-session-ten-tabs').getByTestId('collapsed-site-icon')).toHaveCount(10)
  await sessionExpansion.click()
  await expect(card.getByTestId('collapsed-site-icon')).toHaveCount(10)
  await expect(card.locator('.site-title')).toHaveCount(0)
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
  await page.reload()
  await expect(page.getByTestId('session-session-many-tabs').getByTestId('collapsed-site-icon')).toHaveCount(10)
  await expect(page.getByTestId('session-session-many-tabs').getByTestId('collapsed-site-overflow')).toHaveText('+2')
})

test('creates a session and appends it through the native bridge', async ({ page }) => {
  await openDashboard(page, { initialSessions: sessions })

  await page.getByTestId('add-session').click()
  const newCard = page.locator('.session').first()
  await newCard.hover()
  await newCard.getByTestId('edit-session').click()
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
  const tagInput = card.locator('#autosuggest__input')
  await tagInput.fill('Project')
  await expect(tagInput).toHaveValue('Project')
  await tagInput.press('Tab')
  await expect(card.locator('.tag', { hasText: 'Project' })).toBeVisible()
  await expect.poll(() => lastBridgeCommand(page, 'UpdateSession')).toMatchObject({
    payload: { bookmarks: [{ tags: [{ name: 'Work' }, { name: 'Project' }] }] }
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

  await expect(page.getByText('Connecting to Tab Space...')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tab Space app not detected' })).toBeVisible({ timeout: 5000 })
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
