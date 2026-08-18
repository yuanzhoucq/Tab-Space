(() => {
  "use strict";

  const API = "https://tabspace-worker.mytab.space";
  const FAVICON_API = "https://t2.gstatic.com/faviconV2";
  const match = location.pathname.match(/^\/s\/([A-Za-z0-9_-]{32})\/?$/);
  const zh = (navigator.language || "").toLowerCase().startsWith("zh");
  const openButton = document.getElementById("open-all");
  const copyButton = document.getElementById("copy-all");
  const sitesList = document.getElementById("sites");
  const reportLink = document.getElementById("report-link");

  const words = zh ? {
    tagline: "保存和管理 Safari、Chrome、Edge、Firefox 标签页。",
    get: "获取 Tab Space →",
    loading: "正在载入分享会话…",
    unavailable: "这个分享会话不可用",
    unavailableDescription: "链接可能已过期、已被撤销，或复制不完整。",
    home: "了解 Tab Space",
    shared: "由 Tab Space 分享",
    open: "打开全部",
    blocked: "请允许弹出窗口",
    copy: "复制全部链接",
    copied: "已复制",
    session: "个会话",
    tabs: "个标签页",
    expires: date => `到期：${date}`,
    note: "任何拿到这条高强度随机链接的人都能查看此快照。",
    report: "举报此页面",
  } : {
    tagline: "Save and manage tabs in Safari, Chrome, Edge, and Firefox.",
    get: "Get Tab Space →",
    loading: "Loading shared session…",
    unavailable: "This shared session is unavailable",
    unavailableDescription: "The link may have expired, been revoked, or been copied incorrectly.",
    home: "Visit Tab Space",
    shared: "Shared from Tab Space",
    open: "Open all",
    blocked: "Allow pop-ups",
    copy: "Copy all links",
    copied: "Copied",
    session: "session",
    tabs: "tabs",
    expires: date => `expires ${date}`,
    note: "Anyone with this hard-to-guess link can view this snapshot.",
    report: "Report this page",
  };

  document.documentElement.lang = zh ? "zh-Hans" : "en";
  document.getElementById("brand-tagline").textContent = words.tagline;
  document.getElementById("brand-cta").textContent = words.get;
  document.getElementById("loading-text").textContent = words.loading;
  document.getElementById("error-title").textContent = words.unavailable;
  document.getElementById("error-description").textContent = words.unavailableDescription;
  document.getElementById("error-home").textContent = words.home;
  document.getElementById("shared-label").textContent = words.shared;
  document.getElementById("session-count-label").textContent = words.session;
  document.getElementById("tab-count-label").textContent = words.tabs;
  document.getElementById("privacy-note").textContent = words.note;
  reportLink.textContent = words.report;
  // Snapshots carry no author identity, so the id is the only handle we can
  // act on. It is already in the reporter's address bar; naming it in the
  // subject just saves them pasting it.
  reportLink.href = "mailto:support@mytab.space?subject=" + encodeURIComponent(
    match ? `Report shared session ${match[1]}` : "Report a shared session"
  );
  openButton.textContent = words.open;
  copyButton.textContent = words.copy;

  function showError() {
    document.getElementById("loading").hidden = true;
    document.getElementById("session").hidden = true;
    document.getElementById("error").hidden = false;
    // Nothing loaded, so the meta row would describe and act on content that
    // is not there.
    document.getElementById("meta").hidden = true;
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
    item.dataset.url = url.href;
    item.append(icon, title);
    return item;
  }

  function allURLs() {
    return Array.from(sitesList.children).map(item => item.dataset.url);
  }

  function flash(button, message, restore) {
    button.textContent = message;
    setTimeout(() => { button.textContent = restore; }, 1600);
  }

  function render(data) {
    if (!data || data.version !== 1 || typeof data.title !== "string" || !Array.isArray(data.sites)) {
      showError();
      return;
    }
    const currentSites = data.sites.filter(site => site && safeWebURL(site.url));
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
    document.getElementById("meta").hidden = false;
  }

  openButton.addEventListener("click", () => {
    let blocked = 0;
    for (const url of allURLs()) {
      // Opened without the "noopener" feature so the return value stays
      // meaningful; the handle is severed right after instead.
      const opened = window.open(url, "_blank");
      if (opened) opened.opener = null;
      else blocked += 1;
    }
    // Most browsers allow only the first window per gesture unless the user
    // has permitted pop-ups, so say so rather than silently opening one tab.
    if (blocked > 0) flash(openButton, words.blocked, words.open);
  });

  copyButton.addEventListener("click", async () => {
    const text = allURLs().join("\n");
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
    flash(copyButton, words.copied, words.copy);
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
