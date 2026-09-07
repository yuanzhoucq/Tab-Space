const path = require('path')
const { test, expect } = require('@playwright/test')

async function openPopup(page, options = {}) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 380, height: 700 })
  await page.addInitScript(({ tier, rejectSave, unavailable }) => {
    window.__popupMessages = []
    window.__popupClosed = false
    window.close = () => { window.__popupClosed = true }
    window.browser = {
      storage: { local: { get: async defaults => defaults, set: async () => {} } },
      tabs: { create: async () => {} },
      runtime: {
        sendMessage: async message => {
          window.__popupMessages.push(message)
          switch (message.type) {
            case 'popup.connect': return { ok: true, result: { capabilities: ['sessions.appendTo'] } }
            case 'popup.subscriptionStatus': return unavailable
              ? { ok: false, error: { code: 'connection_failed' } }
              : { ok: true, result: { tier, status: tier === 'pro' ? 'active' : 'free' } }
            case 'popup.listTabs': return { ok: true, result: [
              { id: 1, title: 'Research', url: 'https://example.com/research', isCurrent: true },
              { id: 2, title: 'Reading', url: 'https://example.com/reading', isCurrent: false }
            ] }
            case 'popup.listSessions': return { ok: true, result: [{ uuid: 'research', title: 'Research', siteCount: 3 }] }
            case 'popup.openDashboard': return { ok: true, result: { reused: false } }
            case 'popup.saveTabs': return rejectSave
              ? { ok: false, error: { code: 'pro_required' } }
              : { ok: true, result: { savedCount: message.tabIds.length, tabIds: message.tabIds } }
            default: throw new Error(`Unexpected popup command: ${message.type}`)
          }
        }
      }
    }
  }, { tier: options.tier || 'free', rejectSave: Boolean(options.rejectSave), unavailable: Boolean(options.unavailable) })
  await page.route('**/extension-preview/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const file = name === 'icon.png' ? '../../icon.png' : name
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
