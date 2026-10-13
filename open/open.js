// Shows the page in Chinese when the browser prefers it.
if (navigator.language.toLowerCase().startsWith("zh")) {
  document.documentElement.lang = "zh-Hans";
  document.getElementById("copy-en").hidden = true;
  document.getElementById("copy-zh").hidden = false;
}
