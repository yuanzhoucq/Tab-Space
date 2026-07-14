const CACHE_VERSION = "tab-space-admin-v3"
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`
const ASSET_CACHE = `${CACHE_VERSION}-assets`
const INDEX_URL = "./index.html"

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(["./", INDEX_URL]))
      .then(() => warmAppAssets())
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("tab-space-admin-") && !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(appShellFirst(event.request))
    event.waitUntil(revalidateAppShell(event.request))
    return
  }

  if (/\.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request))
  }
})

async function appShellFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE)
  const cached = await cache.match(request) || await cache.match("./") || await cache.match(INDEX_URL)
  if (cached) return cached

  return fetchAndCacheAppShell(request)
}

async function revalidateAppShell(request) {
  try {
    const cache = await caches.open(APP_SHELL_CACHE)
    const previous = await cache.match(INDEX_URL) || await cache.match("./")
    const response = await fetchAndCacheAppShell(request)

    if (previous && await appShellChanged(previous, response.clone())) {
      await warmAppAssets(response.clone())
      await notifyClients({ type: "TABSPACE_APP_UPDATE_READY" })
    }
  } catch (error) {
    // Cached shell remains usable offline; background refresh is best-effort.
  }
}

async function fetchAndCacheAppShell(request) {
  const cache = await caches.open(APP_SHELL_CACHE)
  const response = await fetch(request, { cache: "no-cache" })
  if (response.ok) {
    await cache.put(request, response.clone())
    await cache.put("./", response.clone())
    await cache.put(INDEX_URL, response.clone())
  }
  return response
}

async function warmAppAssets(response) {
  try {
    const cache = await caches.open(APP_SHELL_CACHE)
    const indexResponse = response || await cache.match(INDEX_URL) || await cache.match("./")
    if (!indexResponse) return

    const html = await indexResponse.clone().text()
    const assetUrls = extractAppAssetUrls(html)
    if (!assetUrls.length) return

    const assetCache = await caches.open(ASSET_CACHE)
    await Promise.all(assetUrls.map(async assetUrl => {
      try {
        if (!await assetCache.match(assetUrl)) {
          const assetResponse = await fetch(assetUrl, { cache: "no-cache" })
          if (isCacheableAsset(assetResponse)) await assetCache.put(assetUrl, assetResponse)
        }
      } catch (error) {
        // Asset warming should not block app shell installation or refresh.
      }
    }))
  } catch (error) {
    // Ignore malformed or unavailable app shell responses.
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  // cache: "no-cache" skips the browser HTTP cache, which may hold a poisoned
  // immutable copy from a past outage that curl/network checks would never see.
  const response = await fetch(request, { cache: "no-cache" })
  if (isCacheableAsset(response)) await cache.put(request, response.clone())
  return response
}

// A missing hashed asset rewritten to index.html by an SPA fallback must never
// be cached under the asset's URL, or the poisoned entry outlives the outage.
function isCacheableAsset(response) {
  if (!response.ok) return false
  const contentType = (response.headers.get("content-type") || "").toLowerCase()
  return !contentType.includes("text/html")
}

async function appShellChanged(previous, next) {
  const previousSignature = extractAppVersionSignature(await previous.clone().text())
  const nextSignature = extractAppVersionSignature(await next.clone().text())
  return Boolean(previousSignature && nextSignature && previousSignature !== nextSignature)
}

function extractAppVersionSignature(html) {
  return extractAppAssetUrls(html).sort().join("|")
}

function extractAppAssetUrls(html) {
  const urls = []
  const pattern = /(?:src|href)=["']?([^"'\s>]+?\.(?:js|css))(?=["'\s>])/gi
  let match

  while ((match = pattern.exec(html))) {
    const assetPath = match[1]
    if (/^(?:\.\/|\/)?(?:js|css)\//.test(assetPath)) {
      urls.push(new URL(assetPath, self.location.origin).href)
    }
  }

  return Array.from(new Set(urls))
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  clients.forEach(client => client.postMessage(message))
}
