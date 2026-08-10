(() => {
  "use strict";

  const API = "https://tabspace-worker.mytab.space";
  const FAVICON_API = "https://t2.gstatic.com/faviconV2";
  const match = location.pathname.match(/^\/s\/([A-Za-z0-9_-]{32})\/?$/);
  const zh = (navigator.language || "").toLowerCase().startsWith("zh");
  const search = document.getElementById("search");
  const copyButton = document.getElementById("copy-all");
  const sitesList = document.getElementById("sites");
  const noResults = document.getElementById("no-results");
  let currentSites = [];

  const words = zh ? {
    tagline: "用 Tab Space 保存和管理你的 Safari 标签页。",
    get: "获取 Tab Space →",
    unlisted: "未列出的公开链接",
    loading: "正在载入分享会话…",
    unavailable: "这个分享会话不可用",
    unavailableDescription: "链接可能已过期、已被撤销，或复制不完整。",
    home: "了解 Tab Space",
    shared: "由 Tab Space 分享",
    search: "搜索标签页",
    copy: "复制全部链接",
    copied: "已复制",
    session: "个会话",
    tabs: "个标签页",
    expires: date => `到期：${date}`,
    noResults: "没有匹配的标签页",
    note: "任何拿到这条高强度随机链接的人都能查看此快照。内容未加密，也不会被公开列出。",
  } : {
    tagline: "Save and manage your Safari tabs with Tab Space.",
    get: "Get Tab Space →",
    unlisted: "Unlisted public link",
    loading: "Loading shared session…",
    unavailable: "This shared session is unavailable",
    unavailableDescription: "The link may have expired, been revoked, or been copied incorrectly.",
    home: "Visit Tab Space",
    shared: "Shared from Tab Space",
    search: "Search tabs",
    copy: "Copy all links",
    copied: "Copied",
    session: "session",
    tabs: "tabs",
    expires: date => `Expires ${date}`,
    noResults: "No matching tabs",
    note: "Anyone with this hard-to-guess link can view this snapshot. It is not encrypted or listed publicly.",
  };

  document.documentElement.lang = zh ? "zh-Hans" : "en";
  document.getElementById("brand-tagline").textContent = words.tagline;
  document.getElementById("brand-cta").textContent = words.get;
  document.getElementById("unlisted-label").textContent = words.unlisted;
  document.getElementById("loading-text").textContent = words.loading;
  document.getElementById("error-title").textContent = words.unavailable;
  document.getElementById("error-description").textContent = words.unavailableDescription;
  document.getElementById("error-home").textContent = words.home;
  document.getElementById("shared-label").textContent = words.shared;
  document.getElementById("session-count-label").textContent = words.session;
  document.getElementById("tab-count-label").textContent = words.tabs;
  noResults.textContent = words.noResults;
  document.getElementById("privacy-note").textContent = words.note;
  search.placeholder = words.search;
  search.setAttribute("aria-label", words.search);
  copyButton.textContent = words.copy;

  function showError() {
    document.getElementById("loading").hidden = true;
    document.getElementById("session").hidden = true;
    document.getElementById("error").hidden = false;
    search.disabled = true;
    copyButton.disabled = true;
  }

  function safeWebURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch (_) {
      return null;
    }
  }

  function faviconURL(url) {
    const favicon = new URL(FAVICON_API);
    favicon.searchParams.set("client", "SOCIAL");
    favicon.searchParams.set("type", "FAVICON");
    favicon.searchParams.set("fallback_opts", "TYPE,SIZE,URL,TOP_DOMAIN");
    favicon.searchParams.set("size", "32");
    // The origin is sufficient to resolve a site icon and avoids disclosing a
    // shared tab's path, query, or fragment to the favicon provider.
    favicon.searchParams.set("url", url.origin);
    return favicon.href;
  }

  function renderSite(site) {
    const url = safeWebURL(site.url);
    const item = document.createElement("li");
    const icon = document.createElement("span");
    const title = document.createElement("span");
    const link = document.createElement("a");
    const label = typeof site.title === "string" && site.title.trim() ? site.title.trim() : url.href;

    const fallbackInitial = (url.hostname.replace(/^www\./, "")[0] || "·").toUpperCase();
    const image = document.createElement("img");
    icon.className = "fav";
    icon.setAttribute("aria-hidden", "true");
    image.src = faviconURL(url);
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.remove();
      icon.classList.add("fav-placeholder");
      icon.textContent = fallbackInitial;
    });
    icon.appendChild(image);
    title.className = "site-title";
    link.className = "link";
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer nofollow ugc";
    link.title = url.href;
    link.textContent = label;
    title.appendChild(link);
    item.dataset.searchText = `${label} ${url.href}`.toLowerCase();
    item.append(icon, title);
    return item;
  }

  function updateSearch() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const item of sitesList.children) {
      item.hidden = Boolean(query) && !item.dataset.searchText.includes(query);
      if (!item.hidden) visible += 1;
    }
    document.getElementById("tab-count").textContent = visible;
    noResults.hidden = visible !== 0;
  }

  function render(data) {
    if (!data || data.version !== 1 || typeof data.title !== "string" || !Array.isArray(data.sites)) {
      showError();
      return;
    }
    currentSites = data.sites.filter(site => site && safeWebURL(site.url));
    if (currentSites.length === 0) {
      showError();
      return;
    }

    document.title = `${data.title} · Tab Space`;
    document.getElementById("session-title").textContent = data.title;
    document.getElementById("tab-count").textContent = currentSites.length;
    document.getElementById("session-expiry").textContent = words.expires(
      new Date(Number(data.expiresAt) * 1000).toLocaleDateString()
    );

    sitesList.replaceChildren(...currentSites.map(renderSite));
    const tags = document.getElementById("tags");
    tags.replaceChildren();
    for (const value of Array.isArray(data.tags) ? data.tags : []) {
      if (typeof value !== "string" || !value.trim()) continue;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = value;
      tags.appendChild(tag);
    }

    document.getElementById("loading").hidden = true;
    document.getElementById("session").hidden = false;
    search.disabled = false;
    copyButton.disabled = false;
  }

  search.addEventListener("input", updateSearch);
  copyButton.addEventListener("click", async () => {
    const text = currentSites.map(site => safeWebURL(site.url).href).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.className = "clipboard-fallback";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    copyButton.textContent = words.copied;
    setTimeout(() => { copyButton.textContent = words.copy; }, 1600);
  });

  if (!match) {
    showError();
    return;
  }
  fetch(`${API}/shares/${match[1]}`, { credentials: "omit", cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject(new Error("unavailable")))
    .then(render)
    .catch(showError);
})();
