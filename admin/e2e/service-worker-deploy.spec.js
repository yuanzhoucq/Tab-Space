const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { test, expect } = require('@playwright/test')

// Reproduces a Cloudflare Pages deploy window: the new index.html goes live a
// little while before its new hashed assets are reachable. The service worker
// must keep serving the previous, complete shell instead of promoting the new
// one, so a refresh during that window never renders an unstyled page.
test('keeps the previous shell until the new deployment assets are reachable', async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabspace-sw-deploy-'))
  const seenRequests = []
  let server

  const initialHtml = [
    '<!DOCTYPE html><html><head>',
    '<link rel="stylesheet" href="css/app.initial.css">',
    '</head><body>',
    '<script src="js/app.initial.js"></script>',
    '</body></html>'
  ].join('')
  const newHtml = initialHtml
    .replace('css/app.initial.css', 'css/app.newhash.css')
    .replace('js/app.initial.js', 'js/app.newhash.js')

  const contentTypes = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'application/javascript'
  }

  function serveFile(filePath, response) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' })
    response.end(fs.readFileSync(filePath))
  }

  server = http.createServer((request, response) => {
    seenRequests.push(request.url.split('?')[0])
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    if (pathname === '/') {
      serveFile(path.join(dir, 'index.html'), response)
      return
    }
    const filePath = path.resolve(dir, pathname.slice(1))
    if (!filePath.startsWith(dir)) {
      response.writeHead(404)
      response.end()
      return
    }
    serveFile(filePath, response)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const origin = `http://127.0.0.1:${server.address().port}`

  try {
    fs.writeFileSync(path.join(dir, 'index.html'), initialHtml)
    fs.mkdirSync(path.join(dir, 'css'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'js'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'css', 'app.initial.css'), 'body { color: rgb(1, 2, 3); }')
    fs.writeFileSync(path.join(dir, 'js', 'app.initial.js'), 'window.__initialLoaded = true')
    fs.writeFileSync(path.join(dir, 'service-worker.js'), fs.readFileSync(path.join(__dirname, '..', 'public', 'service-worker.js')))

    await page.goto(origin)
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js')
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    const shellState = () => page.evaluate(async () => {
      const keys = await caches.keys()
      const shellKey = keys.find(key => key.endsWith('-shell'))
      if (!shellKey) return null
      const cache = await caches.open(shellKey)
      const response = await cache.match('./index.html')
      if (!response) return null
      const html = await response.text()
      return {
        hasInitial: html.includes('app.initial'),
        hasNew: html.includes('app.newhash')
      }
    })

    await expect.poll(shellState).toEqual({ hasInitial: true, hasNew: false })

    // The deploy propagates: new HTML is served, but its hashed assets 404.
    fs.writeFileSync(path.join(dir, 'index.html'), newHtml)
    await page.reload()

    // The revalidation in the service worker must be the only source of the
    // new-asset requests; the page is still being served the old cached shell.
    await expect.poll(() => seenRequests.includes('/css/app.newhash.css')).toBe(true)
    await expect.poll(() => seenRequests.includes('/js/app.newhash.js')).toBe(true)
    await page.waitForTimeout(300)
    await expect.poll(shellState).toEqual({ hasInitial: true, hasNew: false })

    // The assets go live. The next revalidation promotes the new shell and
    // warms its assets, without requiring the user to keep refreshing.
    fs.writeFileSync(path.join(dir, 'css', 'app.newhash.css'), 'body { color: rgb(9, 8, 7); }')
    fs.writeFileSync(path.join(dir, 'js', 'app.newhash.js'), 'window.__newVersionLoaded = true')
    await page.reload()

    await expect.poll(shellState).toEqual({ hasInitial: false, hasNew: true })
    // The background revalidation cached the new shell; the next navigation
    // (the user tapping "refresh") actually serves it with its assets.
    await page.reload()
    await expect.poll(() => page.content()).toContain('app.newhash.css')
    await expect.poll(() => page.evaluate(async () => {
      const keys = await caches.keys()
      const assetKey = keys.find(key => key.endsWith('-assets'))
      if (!assetKey) return false
      const cache = await caches.open(assetKey)
      return Boolean(await cache.match('/css/app.newhash.css'))
    })).toBe(true)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('warms the initial shell assets so the next restart works offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/service-worker.js')
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await expect.poll(() => page.evaluate(async () => {
    const keys = await caches.keys()
    const assetKey = keys.find(key => key.endsWith('-assets'))
    if (!assetKey) return 0
    const cache = await caches.open(assetKey)
    return (await cache.keys()).filter(request => /\.(?:js|css)$/.test(new URL(request.url).pathname)).length
  })).toBeGreaterThan(0)

  await context.setOffline(true)
  try {
    await page.reload()
    // Vue 2 replaces the #app mount node with the rendered component root.
    await expect(page.getByRole('heading', { name: 'Tab Space', exact: true })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})

test('removes redirect metadata before caching the app shell', async ({ page }) => {
  let server
  const indexHtml = [
    '<!DOCTYPE html><html><body><div id="app">Redirect-safe shell</div>',
    '<script src="/app.js"></script></body></html>'
  ].join('')
  const serviceWorkerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'service-worker.js'))

  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname
    if (pathname === '/index.html') {
      response.writeHead(308, { Location: '/' })
      response.end()
      return
    }
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(indexHtml)
      return
    }
    if (pathname === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript' })
      response.end('window.__redirectSafeShellLoaded = true')
      return
    }
    if (pathname === '/service-worker.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' })
      response.end(serviceWorkerSource)
      return
    }
    response.writeHead(404)
    response.end()
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const origin = `http://127.0.0.1:${server.address().port}`

  try {
    await page.goto(origin)
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js')
      await navigator.serviceWorker.ready
    })

    await expect.poll(() => page.evaluate(async () => {
      const shellKey = (await caches.keys()).find(key => key.endsWith('-shell'))
      if (!shellKey) return null
      const response = await (await caches.open(shellKey)).match('/index.html')
      if (!response) return null
      return {
        redirected: response.redirected,
        status: response.status,
        text: await response.text()
      }
    })).toEqual({
      redirected: false,
      status: 200,
      text: indexHtml
    })

    await page.reload()
    await expect.poll(() => page.evaluate(() => window.__redirectSafeShellLoaded)).toBe(true)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
  }
})

test('falls back to the network when Cache Storage cannot be opened', async ({ page }) => {
  let server

  const indexHtml = [
    '<!DOCTYPE html><html><body><div id="app">Cache fallback loaded</div>',
    '<script src="/app.js"></script></body></html>'
  ].join('')
  const serviceWorkerSource = fs
    .readFileSync(path.join(__dirname, '..', 'public', 'service-worker.js'), 'utf8')
    .replace(/\bcaches\./g, 'testCaches.')
  const failingCacheStorage = [
    'const nativeCaches = self.caches;',
    'const testCaches = {',
    '  open() { return Promise.reject(new Error("forced Cache Storage failure")); },',
    '  keys() { return nativeCaches.keys(); },',
    '  delete(key) { return nativeCaches.delete(key); }',
    '};'
  ].join('\n')

  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname
    if (pathname === '/' || pathname === '/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(indexHtml)
      return
    }
    if (pathname === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript' })
      response.end('window.__cacheFallbackLoaded = true')
      return
    }
    if (pathname === '/service-worker.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' })
      response.end(`${failingCacheStorage}\n${serviceWorkerSource}`)
      return
    }
    response.writeHead(404)
    response.end()
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const origin = `http://127.0.0.1:${server.address().port}`

  try {
    await page.goto(origin)
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js')
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    await expect.poll(() => page.evaluate(() => window.__cacheFallbackLoaded)).toBe(true)
    await expect(page.locator('#app')).toHaveText('Cache fallback loaded')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
  }
})
