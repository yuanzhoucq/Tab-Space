(() => {
  "use strict";

  const API = "https://tabspace-worker.mytab.space";
  const match = location.pathname.match(/^\/s\/([A-Za-z0-9_-]{32})\/?$/);
  const zh = (navigator.language || "").toLowerCase().startsWith("zh");
  const copyButton = document.getElementById("copy-all");
  let currentSites = [];

  const words = zh ? {
    unlisted: "未列出的公开链接",
    loading: "正在载入分享会话…",
    unavailable: "这个分享会话不可用",
    unavailableDescription: "链接可能已过期、已被撤销，或复制不完整。",
    home: "了解 Tab Space",
    shared: "分享会话",
    copy: "复制全部链接",
    copied: "已复制",
    tabs: count => `${count} 个标签页`,
    expires: date => `到期时间：${date}`,
    note: "任何拿到这条高强度随机链接的人都能查看此快照。内容未加密，也不会被公开列出。",
  } : {
    unlisted: "Unlisted public link",
    loading: "Loading shared session…",
    unavailable: "This shared session is unavailable",
    unavailableDescription: "The link may have expired, been revoked, or been copied incorrectly.",
    home: "Visit Tab Space",
    shared: "Shared session",
    copy: "Copy all links",
    copied: "Copied",
    tabs: count => `${count} ${count === 1 ? "tab" : "tabs"}`,
    expires: date => `Expires ${date}`,
    note: "Anyone with this hard-to-guess link can view this snapshot. It is not encrypted or listed publicly.",
  };

  document.documentElement.lang = zh ? "zh-Hans" : "en";
  document.getElementById("unlisted-label").textContent = words.unlisted;
  document.getElementById("loading-text").textContent = words.loading;
  document.getElementById("error-title").textContent = words.unavailable;
  document.getElementById("error-description").textContent = words.unavailableDescription;
  document.getElementById("error-home").textContent = words.home;
  document.getElementById("shared-label").textContent = words.shared;
  copyButton.textContent = words.copy;
  document.getElementById("privacy-note").textContent = words.note;

  function showError() {
    document.getElementById("loading").hidden = true;
    document.getElementById("session").hidden = true;
    document.getElementById("error").hidden = false;
  }

  function safeWebURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch (_) {
      return null;
    }
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
    const expiry = new Date(Number(data.expiresAt) * 1000).toLocaleDateString();
    document.getElementById("session-metadata").textContent = `${words.tabs(currentSites.length)} · ${words.expires(expiry)}`;

    const tags = document.getElementById("tags");
    for (const value of Array.isArray(data.tags) ? data.tags : []) {
      if (typeof value !== "string") continue;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `#${value}`;
      tags.appendChild(tag);
    }

    const list = document.getElementById("sites");
    for (const site of currentSites) {
      const url = safeWebURL(site.url);
      const item = document.createElement("li");
      const link = document.createElement("a");
      const title = document.createElement("span");
      const address = document.createElement("span");
      item.className = "site";
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow ugc";
      title.className = "site-title";
      title.textContent = typeof site.title === "string" && site.title.trim() ? site.title : url.href;
      address.className = "site-url";
      address.textContent = url.href;
      link.append(title, address);
      item.appendChild(link);
      list.appendChild(item);
    }

    document.getElementById("loading").hidden = true;
    document.getElementById("session").hidden = false;
  }

  copyButton.addEventListener("click", async () => {
    const text = currentSites.map(site => safeWebURL(site.url).href).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = words.copied;
      setTimeout(() => { copyButton.textContent = words.copy; }, 1600);
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
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
