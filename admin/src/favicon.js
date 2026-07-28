export function faviconUrl(value) {
  const rawUrl = String(value || "").trim()
  if (!rawUrl) return ""

  try {
    const candidate = rawUrl.startsWith("//")
      ? `http:${rawUrl}`
      : (/^[a-z][a-z\d+.-]*:/i.test(rawUrl) ? rawUrl : `http://${rawUrl}`)
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
    return `${parsed.origin}/favicon.ico`
  } catch (_) {
    return ""
  }
}
