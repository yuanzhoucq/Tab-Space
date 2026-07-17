function stringValue(value) {
  return value === undefined || value === null ? "" : String(value)
}

export function searchTerms(query) {
  return stringValue(query)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

export function textMatchesQuery(value, query) {
  const terms = searchTerms(query)
  if (terms.length === 0) return true

  const haystack = stringValue(value).toLowerCase()
  return terms.every(term => haystack.includes(term))
}

export function siteMatchesQuery(site, query) {
  return textMatchesQuery(`${stringValue(site && site.title)}\n${stringValue(site && site.url)}`, query)
}

export function sessionMatchesQuery(session, query) {
  const terms = searchTerms(query)
  if (terms.length === 0) return true

  const metadata = [
    session && session.title,
    session && session.comment,
    ...(session && Array.isArray(session.tags) ? session.tags.map(tag => tag && tag.name) : [])
  ]
  const sites = session && Array.isArray(session.sites) ? session.sites : []

  return textMatchesQuery(metadata.map(stringValue).join("\n"), query)
    || sites.some(site => siteMatchesQuery(site, query))
}

function siteRelevance(site, query) {
  const normalizedQuery = stringValue(query).trim().toLowerCase()
  const title = stringValue(site && site.title).toLowerCase()
  const url = stringValue(site && site.url).toLowerCase()

  if (title === normalizedQuery) return 0
  if (title.startsWith(normalizedQuery)) return 1
  if (textMatchesQuery(title, query)) return 2
  if (textMatchesQuery(url, query)) return 3
  return 4
}

export function matchingSiteEntries(session, query) {
  if (!session || !Array.isArray(session.sites)) return []

  return session.sites
    .map((site, originalIndex) => ({ site, originalIndex }))
    .filter(entry => siteMatchesQuery(entry.site, query))
    .sort((left, right) => {
      const relevance = siteRelevance(left.site, query) - siteRelevance(right.site, query)
      return relevance || left.originalIndex - right.originalIndex
    })
}

export function highlightedTextParts(value, query) {
  const text = stringValue(value)
  const terms = searchTerms(query)
  if (!text || terms.length === 0) return [{ text, match: false }]

  const lowerText = text.toLowerCase()
  const ranges = []

  terms.forEach(term => {
    let start = 0
    while (start < lowerText.length) {
      const index = lowerText.indexOf(term, start)
      if (index === -1) break
      ranges.push({ start: index, end: index + term.length })
      start = index + Math.max(term.length, 1)
    }
  })

  if (ranges.length === 0) return [{ text, match: false }]

  ranges.sort((left, right) => left.start - right.start || left.end - right.end)
  const mergedRanges = []
  ranges.forEach(range => {
    const previous = mergedRanges[mergedRanges.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      mergedRanges.push({ ...range })
    }
  })

  const parts = []
  let cursor = 0
  mergedRanges.forEach(range => {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), match: false })
    parts.push({ text: text.slice(range.start, range.end), match: true })
    cursor = range.end
  })
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false })
  return parts
}
