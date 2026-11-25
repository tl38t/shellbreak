/* 浏览器提供的存档下载和剪贴板能力。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  function downloadJSON(name, contents) {
    var blob = new root.Blob([contents], { type: 'application/json;charset=utf-8' });
    var url = root.URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(text) {
    try {
      var clipboard = root.navigator && root.navigator.clipboard;
      return clipboard && typeof clipboard.writeText === 'function' ? clipboard.writeText(text) : null;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  SB.saveTransferOutput = { downloadJSON: downloadJSON, copyText: copyText };
})(typeof window !== 'undefined' ? window : globalThis);
