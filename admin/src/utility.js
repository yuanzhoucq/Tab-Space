Date.prototype.Format = function (fmt) {
  var o = {
    "y+": this.getFullYear(),
    "M+": this.getMonth() + 1,
    "d+": this.getDate(),
    "h+": this.getHours(),
    "m+": this.getMinutes(),
    "s+": this.getSeconds(),
    "q+": Math.floor((this.getMonth() + 3) / 3),
    "S+": this.getMilliseconds()
  };
  for (var k in o) {
    if (new RegExp("(" + k + ")").test(fmt)) {
      if (k == "y+") {
        fmt = fmt.replace(RegExp.$1, ("" + o[k]).substr(4 - RegExp.$1.length));
      } else if (k == "S+") {
        var lens = RegExp.$1.length;
        lens = lens == 1 ? 3 : lens;
        fmt = fmt.replace(RegExp.$1, ("00" + o[k]).substr(("" + o[k]).length - 1, lens));
      } else {
        fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
      }
    }
  }
  return fmt;
};


module.exports = {
  validURL(str) {
    // adopted from https://stackoverflow.com/a/43467144/12251250
    // note that a scheme http or https must be present as a valid url here
    let url;
    try {
      url = new URL(str);
    } catch (_) {
      return false;  
    }
    return url.protocol === "http:" || url.protocol === "https:";
  },
  validateSessions(sessions) {
    try {
      if (!sessions.every(s => s.sites.length > 0)) throw Error
      JSON.parse(JSON.stringify(sessions))
      return true
    } catch {
      return false
    }
  },
  Clipboard: {
    async copy(text) {
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          return;
        } catch (_) {
          // Fall back for Safari versions or permissions that reject the modern API.
        }
      }

      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);

      try {
        textArea.select();
        textArea.setSelectionRange(0, text.length);
        if (!document.execCommand('copy')) throw new Error('Clipboard copy failed');
      } finally {
        document.body.removeChild(textArea);
      }
    }
  },

  download(filename, text, contentType = 'text/plain') {
    const objectUrl = URL.createObjectURL(new Blob([text], {type: `${contentType};charset=utf-8`}));
    var element = document.createElement('a');
    element.setAttribute('href', objectUrl);
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
