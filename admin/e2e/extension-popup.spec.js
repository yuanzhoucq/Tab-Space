const path = require('path')
const { test, expect } = require('@playwright/test')

async function openPopup(page, options = {}) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 380, height: 700 })
  await page.addInitScript(({ tier, rejectSave, unavailable, connectError, sessions }) => {
    window.__popupMessages = []
    window.__popupClosed = false
    window.close = () => { window.__popupClosed = true }
    // The background page announces pairing progress through runtime messages;
    // this mirrors that channel so the tests can drive it.
    const listeners = []
    window.__emitFromBackground = payload => listeners.forEach(listener => listener(payload))
    window.browser = {
      storage: { local: { get: async defaults => defaults, set: async () => {} } },
      tabs: { create: async () => {} },
      runtime: {
        onMessage: { addListener: listener => listeners.push(listener) },
        sendMessage: async message => {
          window.__popupMessages.push(message)
          switch (message.type) {
            case 'popup.connect': return connectError
              ? { ok: false, error: { code: connectError, message: connectError } }
              : { ok: true, result: { capabilities: ['sessions.appendTo'] } }
            case 'popup.subscriptionStatus': return unavailable
              ? { ok: false, error: { code: 'connection_failed' } }
              : { ok: true, result: { tier, status: tier === 'pro' ? 'active' : 'free' } }
            case 'popup.listTabs': return { ok: true, result: [
              { id: 1, title: 'Research', url: 'https://example.com/research', isCurrent: true },
              { id: 2, title: 'Reading', url: 'https://example.com/reading', isCurrent: false }
            ] }
            case 'popup.listSessions': return { ok: true, result: sessions }
            case 'popup.openDashboard': return { ok: true, result: { reused: false } }
            case 'popup.saveTabs': return rejectSave
              ? { ok: false, error: { code: 'pro_required' } }
              : { ok: true, result: { savedCount: message.tabIds.length, tabIds: message.tabIds } }
            default: throw new Error(`Unexpected popup command: ${message.type}`)
          }
        }
      }
    }
  }, {
    tier: options.tier || 'free',
    rejectSave: Boolean(options.rejectSave),
    unavailable: Boolean(options.unavailable),
    connectError: options.connectError || '',
    sessions: options.sessions || [{ uuid: 'research', title: 'Research', siteCount: 3 }]
  })
  await page.route('**/extension-preview/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const file = /^icon-\d+\.png$/.test(name) ? `../assets/${name}` : name
    await route.fulfill({ path: path.resolve(__dirname, '../../extension/src', file) })
  })
  await page.goto('/extension-preview/popup.html')
  await expect(page.locator('#loading')).toBeHidden()
  expect(errors).toEqual([])
}

for (const tier of ['free', 'plus']) {
  test(`${tier} popup opens the library with disabled Pro save buttons`, async ({ page }) => {
    await openPopup(page, { tier })
    await expect(page.locator('#open-dashboard')).toBeEnabled()
    await expect(page.locator('#editor-view .actions > button').first()).toHaveAttribute('id', 'open-dashboard')
    await expect(page.locator('#save')).toBeDisabled()
    await expect(page.locator('#save-current')).toBeDisabled()
    await expect(page.locator('.pro-chip:visible')).toHaveCount(2)
    await expect(page.locator('#pro-note')).toBeVisible()
    if (tier === 'free') await page.screenshot({ path: '/tmp/tabspace-popup-free.png' })
    await page.locator('#open-dashboard').click()
    expect(await page.evaluate(() => window.__popupMessages.some(message => message.type === 'popup.openDashboard'))).toBe(true)
    expect(await page.evaluate(() => window.__popupMessages.some(message => message.type === 'popup.saveTabs'))).toBe(false)
    expect(await page.evaluate(() => window.__popupClosed)).toBe(true)
  })
}

test('Pro popup can save and has no Pro locks', async ({ page }) => {
  await openPopup(page, { tier: 'pro' })
  await expect(page.locator('#save')).toBeEnabled()
  await expect(page.locator('#save-current')).toBeEnabled()
  await expect(page.locator('.pro-chip:visible')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/tabspace-popup-pro.png' })
  await page.locator('#save').click()
  await expect(page.locator('#success-view')).toBeVisible()
})

test('a lapsed Pro save locks the buttons without disconnecting the library', async ({ page }) => {
  await openPopup(page, { tier: 'pro', rejectSave: true })
  await page.locator('#save').click()
  await expect(page.locator('#save')).toBeDisabled()
  await expect(page.locator('#save-current')).toBeDisabled()
  await expect(page.locator('.pro-chip:visible')).toHaveCount(2)
  await expect(page.locator('#pairing-view')).toBeHidden()
  await expect(page.locator('#open-dashboard')).toBeEnabled()
})

test('unknown entitlement keeps saving disabled and library access available', async ({ page }) => {
  await openPopup(page, { unavailable: true })
  await expect(page.locator('#save')).toBeDisabled()
  await expect(page.locator('#save-current')).toBeDisabled()
  await expect(page.locator('#status')).toContainText('Could not check your plan')
  await expect(page.locator('#open-dashboard')).toBeEnabled()
})

test('shows the approval wait instead of a code box while the Mac app asks', async ({ page }) => {
  // The pairing code is the fallback now: nothing asks for it until the
  // approval request has actually come back refused.
  await openPopup(page)
  await page.evaluate(() => window.__emitFromBackground({ type: 'pairing-awaiting', browser: 'chrome' }))
  await expect(page.locator('#pairing-view')).toBeVisible()
  await expect(page.locator('#pairing-wait')).toBeVisible()
  await expect(page.locator('#pairing-wait')).toContainText('Waiting for you to allow this browser')
  await expect(page.locator('#pairing-manual')).toBeHidden()
  await expect(page.locator('#editor-view')).toBeHidden()
})

test('offers the pairing code once the app declines the request', async ({ page }) => {
  await openPopup(page, { connectError: 'pairing_declined' })
  await expect(page.locator('#pairing-view')).toBeVisible()
  await expect(page.locator('#pairing-wait')).toBeHidden()
  await expect(page.locator('#pairing-manual')).toBeVisible()
  await expect(page.locator('#pairing-status')).toContainText('did not approve this browser')
  // The stale instruction to click "Show Pairing Code" is gone: the Mac app
  // has shown the code in the Multi-Browser panel since 4.1.5.
  await expect(page.locator('#pairing-manual')).toContainText('Multi-Browser Support')
  await expect(page.locator('#pairing-view')).not.toContainText('Show Pairing Code')
})

test('says the app is not running when no helper answered', async ({ page }) => {
  await openPopup(page, { connectError: 'helper_unavailable' })
  await expect(page.locator('#pairing-status')).toContainText('does not seem to be running')
  await expect(page.locator('#launch-app')).toBeVisible()
})

test('submits the pairing code from the keyboard and keeps it numeric', async ({ page }) => {
  await openPopup(page, { connectError: 'pairing_required' })
  await page.locator('#pairing-code').fill('')
  await page.locator('#pairing-code').type('48 29-15x')
  await expect(page.locator('#pairing-code')).toHaveValue('482915')
  await page.locator('#pairing-code').press('Enter')
  await expect.poll(() => page.evaluate(() => window.__popupMessages
    .filter(message => message.type === 'popup.pair')
    .map(message => message.code))).toEqual(['482915'])
})

test('lets the person switch to a pairing code while the Mac app is still asking', async ({ page }) => {
  await openPopup(page)
  await page.evaluate(() => window.__emitFromBackground({ type: 'pairing-awaiting', browser: 'chrome' }))
  await expect(page.locator('#use-pairing-code')).toBeVisible()
  await page.locator('#use-pairing-code').click()
  await expect(page.locator('#pairing-wait')).toBeHidden()
  await expect(page.locator('#pairing-manual')).toBeVisible()
  await expect(page.locator('#pairing-code')).toBeFocused()
})

test('names the Mac account when only backgrounded accounts answered', async ({ page }) => {
  // Every helper that answered belongs to a macOS session that is not on
  // screen; from this person's point of view their Tab Space is not there.
  await openPopup(page, { connectError: 'pairing_not_visible' })
  await expect(page.locator('#pairing-status')).toContainText('did not answer for this Mac account')
  await expect(page.locator('#pairing-manual')).toBeVisible()
})

test('keeps its width when a session title is long', async ({ page }) => {
  // A browser sizes the popup to its content, and the "Save to" select is as
  // wide as its longest option: one long title stretched Firefox's popup to
  // most of the screen.
  await openPopup(page, {
    sessions: [{
      uuid: 'long',
      title: 'Research notes for the quarterly planning review and the follow-up meetings',
      siteCount: 42
    }]
  })
  await expect(page.locator('#save-destination option')).toHaveCount(2)
  // The page equivalent of a popup shrinking to its content's preferred width.
  await page.addStyleTag({ content: 'html { width: max-content; }' })
  const width = await page.evaluate(() => document.documentElement.getBoundingClientRect().width)
  expect(Math.round(width)).toBe(360)
})
