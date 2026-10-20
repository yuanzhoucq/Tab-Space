const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const SAFARI_REPLY_TIMEOUT_MS = 12000
const WORKER_DIAGNOSTICS = 'https://tabspace-worker.mytab.space/diagnostics/product'

async function openPopup(page, options = {}) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 380, height: 700 })
  await page.addInitScript(({ tier, rejectSave, unavailable, connectError, sessions, silent, sessionsError }) => {
    window.__popupMessages = []
    window.__popupClosed = false
    window.__createdTabs = []
    window.__beacons = []
    window.close = () => { window.__popupClosed = true }
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: (url, data) => { window.__beacons.push({ url, data }); return true }
    })
    // The background page announces pairing progress through runtime messages;
    // this mirrors that channel so the tests can drive it.
    const listeners = []
    window.__emitFromBackground = payload => listeners.forEach(listener => listener(payload))
    window.browser = {
      storage: { local: { get: async defaults => defaults, set: async () => {} } },
      tabs: { create: async properties => { window.__createdTabs.push(properties) } },
      runtime: {
        getManifest: () => ({ version: '1.5.0' }),
        onMessage: { addListener: listener => listeners.push(listener) },
        sendMessage: async message => {
          window.__popupMessages.push(message)
          // A wedged Safari background page: the message is delivered, nothing
          // ever comes back.
          if (silent && message.type !== 'safari.menuTelemetry') return new Promise(() => {})
          switch (message.type) {
            case 'safari.menuTelemetry': return { ok: true, result: {} }
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
            case 'popup.listSessions': return sessionsError
              ? { ok: false, error: { code: sessionsError, message: sessionsError } }
              : { ok: true, result: sessions }
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
    sessions: options.sessions || [{ uuid: 'research', title: 'Research', siteCount: 3 }],
    silent: Boolean(options.silent),
    sessionsError: options.sessionsError || ''
  })
  await page.route('**/extension-preview/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const file = /^icon-\d+\.png$/.test(name) ? `../assets/${name}` : name
    const filePath = path.resolve(__dirname, '../../extension/src', file)
    // The Safari package is the same popup with its build-time target switched,
    // exactly as extension/build.mjs does it.
    if (options.target === 'safari' && name === 'popup.js') {
      const source = fs.readFileSync(filePath, 'utf8')
      await route.fulfill({
        contentType: 'text/javascript',
        body: source.replace('const POPUP_TARGET = "companion"', 'const POPUP_TARGET = "safari"')
      })
      return
    }
    await route.fulfill({ path: filePath })
  })
  if (options.clock) await page.clock.install()
  await page.goto('/extension-preview/popup.html')
  if (options.waitForLoad !== false) await expect(page.locator('#loading')).toBeHidden()
  expect(errors).toEqual([])
}

async function beacons(page) {
  return page.evaluate(() => Promise.all(window.__beacons.map(async beacon => ({
    url: beacon.url,
    body: JSON.parse(await beacon.data.text())
  }))))
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
  await expect(page.locator('#unreachable-view')).toBeHidden()
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

test.describe('Safari popup', () => {
  for (const tier of ['free', 'plus']) {
    test(`saves for a ${tier} user: Safari has no Pro gate`, async ({ page }) => {
      await openPopup(page, { target: 'safari', tier })
      await expect(page.locator('#save')).toBeEnabled()
      await expect(page.locator('#save-current')).toBeEnabled()
      await expect(page.locator('.pro-chip:visible')).toHaveCount(0)
      await expect(page.locator('#pro-note')).toBeHidden()
      expect(await page.evaluate(() => window.__popupMessages.some(message => message.type === 'popup.subscriptionStatus'))).toBe(false)
      await page.locator('#save').click()
      await expect(page.locator('#success-view')).toBeVisible()
    })
  }

  test('works without the helper through the native handler', async ({ page }) => {
    // Two in three Safari installs never run the helper; the save goes to the
    // native handler, so no helper is no reason to stop.
    await openPopup(page, { target: 'safari', connectError: 'helper_unavailable' })
    await expect(page.locator('#editor-view')).toBeVisible()
    await expect(page.locator('#pairing-view')).toBeHidden()
    await expect(page.locator('#unreachable-view')).toBeHidden()
    await expect(page.locator('#save-destination option')).toHaveCount(2)
    await page.locator('#save').click()
    await expect(page.locator('#success-view')).toBeVisible()
    expect(await beacons(page)).toEqual([])
  })

  test('asks for a Safari restart when the background page never answers, and reports it', async ({ page }) => {
    await openPopup(page, { target: 'safari', silent: true, clock: true, waitForLoad: false })
    await expect(page.locator('#loading')).toBeVisible()
    await page.clock.fastForward(SAFARI_REPLY_TIMEOUT_MS)
    const view = page.locator('#unreachable-view')
    await expect(view).toBeVisible()
    await expect(view).toContainText("Tab Space isn't responding")
    await expect(view).toContainText('quit Safari (⌘Q) and open it again')
    await expect(view).not.toContainText('pairing code')
    await expect(page.locator('#pairing-view')).toBeHidden()
    await expect(page.locator('#loading')).toBeHidden()

    const sent = await beacons(page)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe(WORKER_DIAGNOSTICS)
    expect(sent[0].body).toMatchObject({
      anonymousInstallID: null,
      appVersion: 'extension 1.5.0',
      platform: 'macos',
      event: 'safari_bridge_silent',
      properties: { source: 'popup', browser: 'safari', resultType: 'no_reply' }
    })
    expect(sent[0].body.eventID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    // At most once a day: the claim is kept across popup openings.
    const reported = await page.evaluate(() => localStorage.getItem('tabspace-bridge-silence-reported'))
    expect(reported).toBe(`${new Date().toISOString().slice(0, 10)}:popup-no_reply`)
  })

  test('says Tab Space is not responding when neither channel works', async ({ page }) => {
    await openPopup(page, { target: 'safari', connectError: 'helper_unavailable', sessionsError: 'native_timeout' })
    await expect(page.locator('#unreachable-view')).toBeVisible()
    await expect(page.locator('#editor-view')).toBeHidden()
    const sent = await beacons(page)
    expect(sent).toHaveLength(1)
    expect(sent[0].body.properties.resultType).toBe('unreachable')
  })

  test("opens the app's main window, not the multi-browser panel", async ({ page }) => {
    await openPopup(page, { target: 'safari', connectError: 'helper_unavailable', sessionsError: 'native_timeout' })
    await page.locator('#unreachable-open-app').click()
    expect(await page.evaluate(() => window.__createdTabs)).toEqual([{ url: 'tabspace://open' }])
  })
})
