import TabSpaceIcon from "!!url-loader?limit=100000!../../icon.png"
import { faviconUrl } from "./favicon"

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function getTagNames(session) {
  return (Array.isArray(session.tags) ? session.tags : [])
    .map(tag => typeof tag === "string" ? tag : tag && tag.name)
    .filter(Boolean)
}

function safeWebUrl(value) {
  const url = String(value || "").trim()
  if (!url) return ""

  try {
    const parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(url) ? url : `http://${url}`)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : ""
  } catch (_) {
    return ""
  }
}

function formatDate(timestamp) {
  const date = new Date(Number(timestamp))
  if (Number.isNaN(date.getTime())) return ""
  const pad = value => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function label(lang, key, fallback) {
  return escapeHtml(lang && lang[key] ? lang[key] : fallback)
}

function filterIcon(name) {
  const paths = {
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',
    circle: '<circle cx="12" cy="12" r="10"></circle>',
    trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>'
  }

  return `<svg class="filter-icon" data-icon="${name}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}

function renderSite(site) {
  const rawUrl = site && site.url ? site.url : ""
  const title = site && site.title ? site.title : rawUrl
  const url = safeWebUrl(rawUrl)
  const favicon = faviconUrl(rawUrl)
  const icon = favicon
    ? `<span class="fav"><img src="${escapeHtml(favicon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true;this.parentNode.classList.add('fav-placeholder')"></span>`
    : '<span class="fav fav-placeholder" aria-hidden="true"></span>'
  const content = url
    ? `<a class="link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
    : `<span class="link invalid-link">${escapeHtml(title)}</span>`

  return `<li>${icon}<span class="site-title">${content}</span></li>`
}

function renderSession(session, lang, index) {
  const tags = getTagNames(session)
  const visibleTags = tags.filter(tag => tag !== "@Favorite")
  const fallbackTitle = `${lang && lang.saveAt ? lang.saveAt : "Saved at"} ${formatDate(session.timestamp)}`
  const title = session.title || fallbackTitle
  const favorite = tags.includes("@Favorite")
    ? `<span class="favorite" title="${label(lang, "favorite", "Favorite")}" aria-label="${label(lang, "favorite", "Favorite")}">★</span>`
    : ""
  const sites = (Array.isArray(session.sites) ? session.sites : []).map(renderSite).join("")
  const tagPills = visibleTags.map(tag => {
    const name = tag === "@Trash" && lang && lang.trashBin ? lang.trashBin : tag
    return `<span class="tag">${escapeHtml(name)}</span>`
  }).join("")
  const encodedTags = encodeURIComponent(JSON.stringify(tags))

  return `<article class="session" data-session-index="${index}" data-tags="${escapeHtml(encodedTags)}">
    <div class="session-header">
      <h2 class="session-title">${escapeHtml(title)}</h2>${favorite}
    </div>
    <ul class="session-sites">${sites}</ul>
    ${tagPills ? `<div class="session-tags">${tagPills}</div>` : ""}
  </article>`
}

export function buildExportHtml(sessions, lang = {}) {
  const exportedSessions = Array.isArray(sessions) ? sessions : []
  const allTags = Array.from(new Set(exportedSessions.flatMap(getTagNames))).sort()
  const userTags = allTags.filter(tag => tag !== "@Favorite" && tag !== "@Trash")
  const hasFavorites = allTags.includes("@Favorite")
  const hasTrash = allTags.includes("@Trash")
  const sessionMarkup = exportedSessions.map((session, index) => renderSession(session, lang, index)).join("\n")
  const tabCount = exportedSessions.reduce((total, session) => total + (Array.isArray(session.sites) ? session.sites.length : 0), 0)
  const filters = [
    '<button class="tag-filter system-tag active-tag" type="button" data-filter="">' + filterIcon("layers") + label(lang, "all", "All") + '</button>',
    hasFavorites ? '<button class="tag-filter system-tag" type="button" data-filter="%40Favorite">' + filterIcon("star") + label(lang, "favorite", "Favorite") + '</button>' : '',
    '<button class="tag-filter system-tag" type="button" data-filter="untagged">' + filterIcon("circle") + label(lang, "untagged", "Untagged") + '</button>',
    hasTrash ? '<button class="tag-filter system-tag" type="button" data-filter="%40Trash">' + filterIcon("trash") + label(lang, "trashBin", "Trash") + '</button>' : '',
    ...userTags.map(tag => `<button class="tag-filter" type="button" data-filter="${escapeHtml(encodeURIComponent(tag))}">${escapeHtml(tag)}</button>`)
  ].filter(Boolean).join("\n")

  return `<!doctype html>
<html lang="${escapeHtml(lang.locale || "en")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${label(lang, "exportTitle", "Tab Space Exported Tabs")}</title>
  <style>
    :root {
      color-scheme: light dark;
      --primary-color: #fa8072;
      --primary-color-hover: #e07060;
      --bg-color: #f4f1ec;
      --card-bg: #fff;
      --text-primary: #2d3748;
      --text-secondary: #718096;
      --border-color: #e2e8f0;
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, .05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, .1), 0 2px 4px -1px rgba(0, 0, 0, .06);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text-primary);
      background: radial-gradient(1200px 500px at 70% -10%, rgba(250, 128, 114, .1), transparent 70%), linear-gradient(-45deg, #efece6, #f8f6f2);
      background-attachment: fixed;
      background-repeat: no-repeat;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
      line-height: 1.5;
    }
    .page-header, .sessions-container, footer {
      width: 100%;
      max-width: 840px;
      margin-right: auto;
      margin-left: auto;
      padding-right: 16px;
      padding-left: 16px;
    }
    .page-header {
      min-height: 118px;
      padding-left: 146px;
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .brand {
      min-width: 0;
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      color: var(--text-primary);
      border: 1px solid transparent;
      border-radius: 12px;
      text-decoration: none;
      transition: background-color .2s ease, border-color .2s ease, transform .2s ease;
    }
    .brand:hover {
      background: rgba(255, 255, 255, .5);
      border-color: rgba(250, 128, 114, .22);
      transform: translateY(-1px);
    }
    .brand-logo {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      object-fit: contain;
      filter: drop-shadow(0 4px 7px rgba(45, 55, 72, .2));
    }
    .brand-copy { min-width: 0; flex: 1; }
    .brand h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .brand-tagline {
      display: block;
      margin-top: 3px;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .brand-cta {
      flex: 0 0 auto;
      padding: 6px 10px;
      color: var(--primary-color-hover);
      background: rgba(250, 128, 114, .12);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 650;
    }
    .search {
      width: min(210px, 34vw);
      padding: 8px 12px;
      color: var(--text-primary);
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font: inherit;
      outline: none;
    }
    .search:focus { border-color: var(--primary-color); box-shadow: 0 0 0 2px rgba(250, 128, 114, .25); }
    .sessions-container { display: flex; align-items: flex-start; }
    .session-sidebar {
      width: 110px;
      flex: 0 0 110px;
      margin-right: 20px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tag-filter {
      width: 100%;
      padding: 8px 12px;
      overflow: hidden;
      color: var(--text-secondary);
      background: transparent;
      border: 0;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    .tag-filter:hover { color: var(--text-primary); background: rgba(0, 0, 0, .06); }
    .tag-filter.active-tag { color: white; background: var(--primary-color); font-weight: 600; }
    .tag-filter.active-tag:hover { background: var(--primary-color-hover); }
    .system-tag { display: inline-flex; align-items: center; gap: 5px; }
    .filter-icon { width: 13px; height: 13px; flex: 0 0 13px; }
    .stats { margin-top: 16px; padding: 12px 12px 0; border-top: 1px solid var(--border-color); }
    .stat-item { color: var(--text-secondary); font-size: 12px; line-height: 1.8; }
    .sessions-list { min-width: 0; flex: 1; }
    .session {
      position: relative;
      width: 100%;
      margin: 0 auto 16px;
      padding: 14px 18px 10px 28px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: var(--shadow-sm);
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .session:hover { z-index: 2; transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .session[hidden] { display: none; }
    .session-header { display: flex; align-items: center; margin-bottom: 10px; }
    .session-title {
      display: inline-block;
      max-width: calc(100% - 30px);
      min-height: 22px;
      margin: 0 8px 0 0;
      overflow: hidden;
      font-size: 18px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
      box-shadow: inset 0 -10px #fadc23;
    }
    .favorite { color: var(--primary-color); font-size: 18px; line-height: 1; }
    .session-sites { margin: 0 0 0 -45px; padding-left: 40px; }
    .session-sites li {
      position: relative;
      display: flex;
      align-items: center;
      min-width: 0;
      margin: 2px 8px;
      padding: 5px 8px;
      list-style: none;
      border-radius: 4px;
    }
    .session-sites li:hover { background: rgba(0, 0, 0, .06); }
    .fav { width: 14px; height: 14px; margin-right: 5px; display: flex; flex: 0 0 14px; align-items: center; justify-content: center; }
    .fav img { width: 14px; height: 14px; object-fit: contain; }
    .fav-placeholder { border: 1px solid var(--text-secondary); border-radius: 50%; opacity: .45; }
    .site-title { min-width: 0; flex: 1; }
    .link {
      display: block;
      max-width: calc(100% - 18px);
      overflow: hidden;
      color: var(--text-primary);
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .link:hover { color: var(--primary-color-hover); }
    .invalid-link { color: var(--text-secondary); cursor: default; }
    .session-tags { display: flex; flex-wrap: wrap; align-items: center; margin-top: 6px; }
    .tag {
      display: inline-flex;
      align-items: center;
      margin: 1px 5px 5px 0;
      padding: 5px 10px;
      color: #666;
      background: #f0f0f0;
      border: 1px solid #e0e0e0;
      border-radius: 999px;
      font-size: 11px;
      line-height: 1;
    }
    .empty-state { padding: 60px 20px; color: var(--text-secondary); text-align: center; }
    footer { padding-top: 12px; padding-bottom: 22px; color: var(--text-secondary); font-size: 12px; text-align: center; }
    @media (max-width: 700px) {
      .page-header { min-height: 90px; padding: 14px 16px; flex-wrap: wrap; }
      .brand { width: 100%; flex-basis: 100%; padding: 8px 0; }
      .brand:hover { background: transparent; border-color: transparent; }
      .brand-cta { display: none; }
      .search { width: 100%; max-width: none; margin-bottom: 14px; }
      .sessions-container { flex-wrap: wrap; }
      .session-sidebar { width: 100%; flex: 1 0 100%; flex-direction: row; flex-wrap: wrap; align-items: center; margin: 0 0 12px; gap: 4px; }
      .tag-filter { width: auto; padding: 6px 12px; border-radius: 999px; }
      .stats { display: flex; gap: 12px; margin: 0 0 0 auto; padding: 0 4px; border: 0; }
      .session { padding-left: 18px; }
      .session-sites { margin-left: -35px; }
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg-color: #1a1a1a; --card-bg: #2a2a2a; --text-primary: #e8e8e8; --text-secondary: #999; --border-color: #444; --shadow-sm: 0 1px 2px rgba(0, 0, 0, .3); --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, .4); }
      body { background: radial-gradient(1200px 500px at 70% -10%, rgba(250, 128, 114, .08), transparent 70%), linear-gradient(-45deg, #171717, #222); }
      .session-title { box-shadow: inset 0 -10px #685e02; }
      .tag { color: #ccc; background: #3a3a3a; border-color: #4a4a4a; }
      .tag-filter:hover, .session-sites li:hover { background: rgba(255, 255, 255, .08); }
      .brand:hover { background: rgba(255, 255, 255, .04); }
    }
    @media print {
      body { background: white; }
      .search { display: none; }
      .session { break-inside: avoid; box-shadow: none; }
      .session:hover { transform: none; }
    }
  </style>
</head>
<body>
  <header class="page-header">
    <a class="brand" href="https://mytab.space" target="_blank" rel="noopener noreferrer" aria-label="Tab Space">
      <img class="brand-logo" src="${escapeHtml(TabSpaceIcon)}" alt="Tab Space">
      <span class="brand-copy">
        <h1>Tab Space</h1>
        <span class="brand-tagline">${label(lang, "appNotDetectedTip", "Save and manage your Safari tabs with Tab Space.")}</span>
      </span>
      <span class="brand-cta">${label(lang, "getTabSpace", "Get Tab Space")} →</span>
    </a>
    <input class="search" type="search" placeholder="${label(lang, "searchPlaceholder", "Search sessions")}" aria-label="${label(lang, "searchPlaceholder", "Search sessions")}">
  </header>
  <main class="sessions-container">
    <aside class="session-sidebar" aria-label="Tags">
      ${filters}
      <div class="stats">
        <div class="stat-item"><span data-session-count>${exportedSessions.length}</span> ${label(lang, "sessions", "sessions")}</div>
        <div class="stat-item"><span data-tab-count>${tabCount}</span> ${label(lang, "tabs", "tabs")}</div>
      </div>
    </aside>
    <section class="sessions-list">
      ${sessionMarkup || `<div class="empty-state">${label(lang, "nothingHere", "Nothing here")}</div>`}
      <div class="empty-state" data-no-results hidden>${label(lang, "nothingHere", "Nothing here")}</div>
    </section>
  </main>
  <footer>Tab Space · ${escapeHtml(formatDate(Date.now()))}</footer>
  <script>
    (function () {
      var cards = Array.prototype.slice.call(document.querySelectorAll('.session'));
      var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
      var search = document.querySelector('.search');
      var noResults = document.querySelector('[data-no-results]');
      var sessionCount = document.querySelector('[data-session-count]');
      var tabCount = document.querySelector('[data-tab-count]');
      var activeFilter = '';

      function cardTags(card) {
        try { return JSON.parse(decodeURIComponent(card.getAttribute('data-tags') || '%5B%5D')); }
        catch (_) { return []; }
      }

      function update() {
        var query = (search.value || '').trim().toLowerCase();
        var visibleSessions = 0;
        var visibleTabs = 0;
        cards.forEach(function (card) {
          var tags = cardTags(card);
          var matchesTag = !activeFilter
            || (activeFilter === 'untagged' ? tags.length === 0 : tags.indexOf(activeFilter) !== -1);
          var matchesSearch = !query || card.textContent.toLowerCase().indexOf(query) !== -1;
          card.hidden = !(matchesTag && matchesSearch);
          if (!card.hidden) {
            visibleSessions += 1;
            visibleTabs += card.querySelectorAll('.session-sites li').length;
          }
        });
        sessionCount.textContent = visibleSessions;
        tabCount.textContent = visibleTabs;
        noResults.hidden = visibleSessions !== 0;
      }

      buttons.forEach(function (button) {
        button.addEventListener('click', function () {
          activeFilter = decodeURIComponent(button.getAttribute('data-filter') || '');
          buttons.forEach(function (item) { item.classList.toggle('active-tag', item === button); });
          update();
        });
      });
      search.addEventListener('input', update);
      update();
    }());
  </script>
</body>
</html>`
}
