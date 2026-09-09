const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { chromium } = require('../../admin/node_modules/playwright')

const target = process.argv[2]
const executablePath = process.argv[3]
const dashboardUrl = process.argv[4]

if (!['chrome', 'edge', 'chrome-dev', 'edge-dev'].includes(target) || !executablePath) {
  process.stderr.write('Usage: node extension/test/browser-load.smoke.cjs <chrome|edge|chrome-dev|edge-dev> <browser executable> [dashboard URL]\n')
  process.exit(2)
}

async function main() {
  const extensionPath = resolve(__dirname, '..', 'dist', target)
  const profilePath = await mkdtemp(join(tmpdir(), `tabspace-${target}-smoke-`))
  let context
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run'
      ]
    })
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest())
    assert.equal(manifest.name, target.endsWith('-dev') ? 'Tab Space (Dev)' : 'Tab Space')
    // Compared against the package on disk rather than a literal, which went
    // stale the first time version.mjs was bumped.
    assert.equal(manifest.version, JSON.parse(readFileSync(join(extensionPath, 'manifest.json'), 'utf8')).version)
    assert.equal('version_name' in manifest, false)
    assert.equal(manifest.manifest_version, 3)
    // The toolbar icon is fixed, so the extension asks for no offscreen document
    // and opens none: a stray one would mean theme switching was reintroduced.
    assert.equal(manifest.permissions.includes('offscreen'), false)
    assert.deepEqual(Object.keys(manifest.action.default_icon).sort(), ['128', '16', '32', '48'])
    const offscreenContexts = await worker.evaluate(() => chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    }).then(contexts => contexts.length))
    assert.equal(offscreenContexts, 0)

    const extensionId = new URL(worker.url()).host
    const page = await context.newPage()
    const pageErrors = []
    let bridgeStatus = ''
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto(`chrome-extension://${extensionId}/popup.html`)
    await page.locator('h1').waitFor()
    assert.equal(await page.locator('h1').textContent(), 'Tab Space')
    assert.equal(await page.locator('#open-dashboard-after-save').isChecked(), false)
    assert.equal(await page.locator('#close-tabs-after-save').isChecked(), false)
    assert.equal(await page.locator('#save-destination').inputValue(), 'new')
    assert.equal(await page.locator('#tab-section').isHidden(), true)
    assert.deepEqual(pageErrors, [])
    if (dashboardUrl) {
      await page.addInitScript(() => {
        window.__tabSpaceExtensionMessages = []
        window.addEventListener('message', event => {
          if (event.data && event.data.channel === 'tabspace-webextension-v2') {
            window.__tabSpaceExtensionMessages.push(event.data)
          }
        })
      })
      await page.goto(dashboardUrl)
      await page.waitForFunction(() => window.__tabSpaceExtensionMessages.some(message => (
        message.source === 'extension' && message.type === 'ready'
      )), null, { timeout: 15000 })
      await page.waitForFunction(() => window.__tabSpaceExtensionMessages.some(message => (
        message.source === 'extension'
          && (message.type === 'connected' || message.type === 'connection-error')
      )), null, { timeout: 15000 })
      const bridgeOutcome = await page.evaluate(() => window.__tabSpaceExtensionMessages.findLast(message => (
        message.source === 'extension'
          && (message.type === 'connected' || message.type === 'connection-error')
      )))
      if (bridgeOutcome.type === 'connection-error') {
        assert.ok(
          ['pairing_required', 'authentication_failed', 'helper_unavailable'].includes(bridgeOutcome.error && bridgeOutcome.error.code),
          `Unexpected local bridge error: ${JSON.stringify(bridgeOutcome.error)}`
        )
      }
      bridgeStatus = `, bridge=${bridgeOutcome.type === 'connected' ? 'connected' : bridgeOutcome.error.code}`
    }
    process.stdout.write(`${target}: loaded Tab Space ${manifest.version} (${extensionId})${bridgeStatus}\n`)
  } finally {
    if (context) await context.close()
    await rm(profilePath, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
