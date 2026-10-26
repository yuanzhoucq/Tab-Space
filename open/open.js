// Shows the page in Chinese when the browser prefers it; open.css hides the
// other language's text.
if (navigator.language.toLowerCase().startsWith("zh")) {
  document.documentElement.lang = "zh-Hans";
  document.title = "正在 Safari 中打开 · Tab Space";
}
