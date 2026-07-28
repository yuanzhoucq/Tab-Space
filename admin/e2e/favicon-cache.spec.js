const http = require('http')
const { test, expect } = require('@playwright/test')

const faviconSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">',
  '<rect width="16" height="16" rx="3" fill="#ff7f72"/>',
  '</svg>'
].join('')

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve(server.address())
    })
  })
}

function close(server) {
  return new Promise(resolve => server.close(resolve))
}

async function loadImages(page, url, count) {
  return page.evaluate(({ faviconUrl, imageCount }) => Promise.all(
    Array.from({ length: imageCount }, () => new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`Failed to load ${faviconUrl}`))
      image.src = faviconUrl
      document.body.appendChild(image)
    }))
  ), { faviconUrl: url, imageCount: count })
}

test('caches remote favicons and reuses one request for duplicate origins', async ({ page, context }) => {
  let faviconRequests = 0
  const faviconServer = http.createServer((request, response) => {
    if (request.url !== '/favicon.ico') {
      response.writeHead(404)
      response.end()
      return
    }

    faviconRequests += 1
    setTimeout(() => {
      response.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store'
      })
      response.end(faviconSvg)
    }, 100)
  })
  const address = await listen(faviconServer)
  const faviconUrl = `http://127.0.0.1:${address.port}/favicon.ico`

  try {
    await page.goto('/')
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js')
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    await loadImages(page, faviconUrl, 2)
    expect(faviconRequests).toBe(1)
    await expect.poll(() => page.evaluate(async url => {
      const cache = await caches.open('tab-space-favicons-v1')
      return Boolean(await cache.match(url))
    }, faviconUrl)).toBe(true)

    const devtools = await context.newCDPSession(page)
    await devtools.send('Network.enable')
    await devtools.send('Network.clearBrowserCache')
    await context.setOffline(true)

    await loadImages(page, faviconUrl, 1)
    expect(faviconRequests).toBe(1)
  } finally {
    await context.setOffline(false)
    await close(faviconServer)
  }
})
