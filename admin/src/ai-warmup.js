import config from './config'

const productionDashboardHost = 'app.mytab.space'
const warmupCooldownMs = 5 * 60 * 1000
const aiActionSelector = [
  '[data-testid="ai-enhance-session"]',
  '[data-testid="ai-split-session"]'
].join(', ')

let lastWarmupAttempt = 0
let warmupInFlight = null

/**
 * Best-effort AI preflight: ask the native bridge to prepare authentication
 * and ping the public Worker route. This never blocks an AI command and is
 * limited to production plus a five-minute cooldown so normal pointer
 * movement cannot create sustained traffic.
 */
export function warmAIWorker() {
  if (window.location.hostname !== productionDashboardHost) {
    return Promise.resolve(false)
  }

  const now = Date.now()
  if (warmupInFlight) return warmupInFlight
  if (now - lastWarmupAttempt < warmupCooldownMs) return Promise.resolve(false)
  lastWarmupAttempt = now

  window.dispatchEvent(new CustomEvent('tabspace:prepare-ai'))
  warmupInFlight = fetch(`${config.aiWorkerEndpoint}/ai/warmup`, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    keepalive: true
  })
    .then(response => response.status === 204)
    .catch(() => false)
    .finally(() => {
      warmupInFlight = null
    })

  return warmupInFlight
}

export function installAIWorkerWarmup() {
  if (window.location.hostname !== productionDashboardHost) return

  const warmOnIntent = event => {
    const target = event.target
    if (!(target instanceof Element) || !target.closest(aiActionSelector)) return
    warmAIWorker()
  }
  const warmOnVisibility = () => {
    if (document.visibilityState === 'visible') warmAIWorker()
  }

  document.addEventListener('pointerover', warmOnIntent)
  document.addEventListener('focusin', warmOnIntent)
  document.addEventListener('visibilitychange', warmOnVisibility)
  warmAIWorker()
}
