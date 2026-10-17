// Turns other tab managers' exports into the session shape AppendSessions
// takes. Timestamps are in seconds, as the native side stores them.
import { validURL } from "./utility"

const nowInSeconds = () => parseInt(Date.now() / 1000)

// An import travels to the Tab Space app as a single message, and the app
// refuses messages over 4 MB without an answer that names the import, so an
// oversized one used to do nothing at all. The slack covers the envelope the
// sessions are wrapped in on the way.
const MAX_IMPORT_BYTES = 4 * 1024 * 1024 - 16 * 1024

export function exceedsImportLimit(sessions) {
  return new TextEncoder().encode(JSON.stringify(sessions)).length > MAX_IMPORT_BYTES
}

// OneTab's "Export URLs" text: one `url | title` per line, groups separated by
// blank lines. Pasted text often carries \r\n line endings, extra blank lines
// or a trailing newline; none of those should turn into an empty group, and one
// bad line should not sink the rest of the paste.
export function parseOneTab(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map(group => {
      const sites = []
      group.split("\n").forEach(line => {
        line = line.trim()
        const separator = line.indexOf(" | ")
        const url = (separator === -1 ? line : line.slice(0, separator)).trim()
        const title = separator === -1 ? "" : line.slice(separator + 3).trim()
        if (validURL(url)) sites.push({ title: title || url, url })
      })
      return {
        timestamp: nowInSeconds(),
        sites,
        title: "From OneTab",
        tags: []
      }
    })
    .filter(session => session.sites.length > 0)
}

export function isTabXpertExport(data) {
  return Boolean(data) && !Array.isArray(data) && Array.isArray(data.windows)
}

function tagNames(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map(tag => (typeof tag === "string" ? tag : tag && (tag.name || tag.title)))
    .filter(name => typeof name === "string" && name.trim())
    .map(name => ({ name: name.trim() }))
}

// A TabXpert window keeps the tabs that were saved (`tabs`) apart from the ones
// open in it since (`cTabs`); both are what the user sees in the session, so
// both come across. Folders are not in any export we have seen populated, so
// they are read as more of the same rather than guessed into separate sessions.
function collectTabXpertTabs(container, sites, seen) {
  for (const tabs of [container.tabs, container.cTabs]) {
    for (const tab of Array.isArray(tabs) ? tabs : []) {
      if (!tab || !validURL(tab.url) || seen.has(tab.url)) continue
      seen.add(tab.url)
      sites.push({ title: (tab.title || "").trim() || tab.url, url: tab.url })
    }
  }
  for (const folder of Array.isArray(container.folders) ? container.folders : []) {
    if (folder && typeof folder === "object") collectTabXpertTabs(folder, sites, seen)
  }
}

export function parseTabXpert(data) {
  return data.windows
    .map(window => {
      const sites = []
      collectTabXpertTabs(window, sites, new Set())
      const created = Number(window.createdAt)
      return {
        timestamp: created > 0 ? parseInt(created / 1000) : nowInSeconds(),
        sites,
        title: (window.title || "").trim() || "From TabXpert",
        tags: tagNames(window.tags)
      }
    })
    .filter(session => session.sites.length > 0)
}

// Tab-Space's own .tabspace backups: either the session objects themselves or
// the older compact [timestamp, [[title, url]], title, [tag]] arrays.
export function parseTabSpaceBackup(data) {
  if (!Array.isArray(data)) return []
  if (Array.isArray(data[0])) {
    return data.map(session => ({
      timestamp: parseInt(session[0] / 1000),
      sites: session[1].map(s => ({ title: s[0], url: s[1] })),
      title: session[2],
      tags: session[3] ? session[3].map(t => ({ name: t })) : []
    }))
  }
  return data
}

// Any file picked from the import menu: TabXpert's JSON export is recognised
// by its shape, so it does not matter which entry the file came through.
export function parseImportFile(text) {
  const data = JSON.parse(text)
  return isTabXpertExport(data) ? parseTabXpert(data) : parseTabSpaceBackup(data)
}
