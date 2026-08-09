const CACHE_VERSION = "tab-space-admin-v3"
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`
const ASSET_CACHE = `${CACHE_VERSION}-assets`
const FAVICON_CACHE_PREFIX = "tab-space-favicons-"
const FAVICON_CACHE = `${FAVICON_CACHE_PREFIX}v1`
const INDEX_URL = "./index.html"
const PROMOTION_RETRY_INITIAL_MS = 30000
const PROMOTION_RETRY_MAX_MS = 60000
const faviconFetches = new Map()

// Set while a newer app shell is waiting for its assets to be published, so a
// background retry can finish the update without another page load.
let pendingPromotionUrl = null
let promotionRetryTimer = null
let promotionRetryDelayMs = PROMOTION_RETRY_INITIAL_MS

self.addEventListener("install", event => {
  event.waitUntil(
    prepareAppShellForInstall()
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    cleanOldCaches()
      .catch(() => {})
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return

  const url = new URL(event.request.url)
  if (isRemoteFaviconRequest(event.request, url)) {
    event.respondWith(faviconCacheFirst(event.request))
    return
  }

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

function isRemoteFaviconRequest(request, url) {
  return url.origin !== self.location.origin
    && request.destination === "image"
    && /^\/favicon\.ico$/i.test(url.pathname)
}

async function faviconCacheFirst(request) {
  let cache
  let cached
  try {
    cache = await caches.open(FAVICON_CACHE)
    cached = await cache.match(request)
  } catch (error) {
    // Private browsing or storage pressure can make Cache Storage unavailable.
    return fetch(request)
  }
  if (cached) return cached

  let pendingFetch = faviconFetches.get(request.url)
  if (!pendingFetch) {
    pendingFetch = fetchAndCacheFavicon(request, cache)
      .finally(() => faviconFetches.delete(request.url))
    faviconFetches.set(request.url, pendingFetch)
  }

  return (await pendingFetch).clone()
}

async function fetchAndCacheFavicon(request, cache) {
  try {
    const response = await fetch(request)
    // Cross-origin images usually produce opaque responses. Cache.put supports
    // them even though their status and headers are intentionally unreadable.
    if (response.ok || response.type === "opaque") {
      try {
        await cache.put(request, response.clone())
      } catch (error) {
        // A full or disabled cache must not prevent the favicon from rendering.
      }
    }
    return response
  } catch (error) {
    return Response.error()
  }
}

async function appShellFirst(request) {
  try {
    const cache = await caches.open(APP_SHELL_CACHE)
    const cached = await cache.match(request) || await cache.match("./") || await cache.match(INDEX_URL)
    if (cached) return cached
  } catch (error) {
    // Edge private windows and storage pressure can make Cache Storage fail
    // transiently. The dashboard is still online, so do not turn that storage
    // failure into a browser-level navigation error.
  }

  return fetchAndCacheAppShell(request)
}

async function revalidateAppShell(request) {
  try {
    const cache = await caches.open(APP_SHELL_CACHE)
    const previous = await cache.match(INDEX_URL) || await cache.match("./")
    const response = await fetch(request, { cache: "no-cache" })
    if (!response.ok) return

    const previousSignature = previous
      ? await extractAppVersionSignature(await previous.clone().text())
      : ""
    const nextSignature = await extractAppVersionSignature(await response.clone().text())
    const assetsReady = nextSignature ? await warmAppAssets(response.clone()) : !previous

    if (nextSignature && !assetsReady) {
      // This covers both deploy propagation and a browser that evicted only
      // part of the asset cache. Keep the last complete shell and retry later.
      deferAppShellPromotion(request.url)
      return
    }

    if (previous && previousSignature && nextSignature && previousSignature !== nextSignature) {
      await cacheAppShellResponse(request, response)
      await pruneOrphanedAssets(response.clone())
      await notifyClients({ type: "TABSPACE_APP_UPDATE_READY" })
      clearPromotionRetry()
      return
    }

    if (nextSignature || !previous) {
      await cacheAppShellResponse(request, response)
      await pruneOrphanedAssets(response.clone())
      clearPromotionRetry()
    }
  } catch (error) {
    // Cached shell remains usable offline; background refresh is best-effort.
  }
}

async function fetchAndCacheAppShell(request) {
  const response = await fetch(request, { cache: "no-cache" })
  if (response.ok) {
    try {
      await cacheAppShellResponse(request, response)
    } catch (error) {
      // A successful network navigation must not depend on writable storage.
    }
  }
  return response
}

async function cacheAppShellResponse(request, response) {
  const cache = await caches.open(APP_SHELL_CACHE)
  if (request) await cache.put(request, response.clone())
  await cache.put(INDEX_URL, response.clone())
  await cache.put("./", response.clone())
}

// Warm the assets referenced by a new shell and report whether every one of
// them is available. Failed fetches leave the asset uncached so a later
// retry can pick it up.
async function warmAppAssets(response) {
  try {
    const cache = await caches.open(APP_SHELL_CACHE)
    const indexResponse = response || await cache.match(INDEX_URL) || await cache.match("./")
    if (!indexResponse) return true

    const html = await indexResponse.clone().text()
    const assetUrls = extractAppAssetUrls(html)
    if (!assetUrls.length) return true

    const assetCache = await caches.open(ASSET_CACHE)
    const results = await Promise.all(assetUrls.map(async assetUrl => {
      try {
        if (await assetCache.match(assetUrl)) return true
        const assetResponse = await fetch(assetUrl, { cache: "no-cache" })
        if (!isCacheableAsset(assetResponse)) return false
        await assetCache.put(assetUrl, assetResponse.clone())
        return true
      } catch (error) {
        return false
      }
    }))
    return results.every(Boolean)
  } catch (error) {
    return false
  }
}

// Called at install time so a new service worker never promotes a shell whose
// assets are not published yet. The cache version stays stable so the
// previously verified shell survives activation until the new one is ready.
async function prepareAppShellForInstall() {
  try {
    const cache = await caches.open(APP_SHELL_CACHE)
    const previous = await cache.match(INDEX_URL) || await cache.match("./")
    const response = await fetch(INDEX_URL, { cache: "no-cache" })
    if (!response.ok) return

    const previousSignature = previous
      ? await extractAppVersionSignature(await previous.clone().text())
      : ""
    const nextSignature = await extractAppVersionSignature(await response.clone().text())

    // Never overwrite a working shell with HTML whose assets we cannot verify.
    if (!nextSignature && previous) return

    const changed = Boolean(previousSignature && nextSignature && previousSignature !== nextSignature)
    // First installs need their assets warmed too. Otherwise the shell can be
    // available offline while its hashed JS/CSS only ever lived in the HTTP
    // cache, leaving the first offline restart as a blank/error page.
    const assetsReady = nextSignature ? await warmAppAssets(response.clone()) : !previous
    if (assetsReady) {
      await cacheAppShellResponse(null, response)
      await pruneOrphanedAssets(response.clone())
      if (changed) await notifyClients({ type: "TABSPACE_APP_UPDATE_READY" })
    } else {
      deferAppShellPromotion(new URL("./", self.registration.scope).href)
    }
  } catch (error) {
    // Keep whatever shell is already cached; revalidation will retry later.
  }
}

function deferAppShellPromotion(url) {
  pendingPromotionUrl = url
  if (promotionRetryTimer) return
  const delay = promotionRetryDelayMs
  promotionRetryTimer = setTimeout(async () => {
    promotionRetryTimer = null
    try {
      await retryAppShellPromotion()
    } catch (error) {
      // Ignore; the next navigation or retry will try again.
    }
    promotionRetryDelayMs = Math.min(promotionRetryDelayMs * 2, PROMOTION_RETRY_MAX_MS)
  }, delay)
}

async function retryAppShellPromotion() {
  if (!pendingPromotionUrl) return
  await revalidateAppShell(new Request(pendingPromotionUrl, { cache: "no-cache" }))
}

function clearPromotionRetry() {
  if (promotionRetryTimer) {
    clearTimeout(promotionRetryTimer)
    promotionRetryTimer = null
  }
  pendingPromotionUrl = null
  promotionRetryDelayMs = PROMOTION_RETRY_INITIAL_MS
}

// Old hashed JS/CSS entries linger in the asset cache when the shell version
// stays stable, so drop anything the current shell no longer references.
async function pruneOrphanedAssets(response) {
  try {
    const html = await response.clone().text()
    const referenced = new Set(extractAppAssetUrls(html))
    const cache = await caches.open(ASSET_CACHE)
    const keys = await cache.keys()
    await Promise.all(keys.map(async key => {
      if (/\.(?:js|css)(?:$|\?)/i.test(key.url) && !referenced.has(key.url)) {
        await cache.delete(key)
      }
    }))
  } catch (error) {
    // Pruning is best-effort; stale assets are harmless apart from storage.
  }
}

async function cacheFirst(request) {
  let cache = null
  try {
    cache = await caches.open(ASSET_CACHE)
    const cached = await cache.match(request)
    if (cached) return cached
  } catch (error) {
    // Cache Storage is an optimization. Keep the network path usable when a
    // browser temporarily denies or cannot open it.
  }

  // cache: "no-cache" skips the browser HTTP cache, which may hold a poisoned
  // immutable copy from a past outage that curl/network checks would never see.
  try {
    const response = await fetch(request, { cache: "no-cache" })
    if (cache && isCacheableAsset(response)) {
      try {
        await cache.put(request, response.clone())
      } catch (error) {
        // Rendering from the network is still a valid success.
      }
    }
    return response
  } catch (error) {
    return Response.error()
  }
}

async function cleanOldCaches() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter(key => (
        (key.startsWith("tab-space-admin-") && !key.startsWith(CACHE_VERSION))
        || (key.startsWith(FAVICON_CACHE_PREFIX) && key !== FAVICON_CACHE)
      ))
      .map(key => caches.delete(key))
  )
}

// A missing hashed asset rewritten to index.html by an SPA fallback must never
// be cached under the asset's URL, or the poisoned entry outlives the outage.
function isCacheableAsset(response) {
  if (!response.ok) return false
  const contentType = (response.headers.get("content-type") || "").toLowerCase()
  return !contentType.includes("text/html")
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
