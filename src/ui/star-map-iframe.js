/* Web、TapTap 和 Steam 的星图入口。 */
(function (root) {
  'use strict';

  function markup(title) {
    return '<div class="starmap-frame-wrap">' +
      '<iframe class="starmap-frame" sandbox="allow-scripts" ' +
      'src="src/ui/star-map-frame.html?v=12" title="' + title + '" ' +
      'style="width:100%;height:780px;border:0;border-radius:12px;background:#07111d"></iframe></div>';
  }

  function mount(pane, receive) {
    var frame = pane.querySelector('iframe.starmap-frame');
    if (!frame) return null;
    function onMessage(event) {
      var data = event.data;
      if (event.source !== frame.contentWindow || !data) return;
      if (data.type === 'sb-star-map-height') {
        frame.style.height = Math.max(600, Math.min(1200, Number(data.height) || 780)) + 'px';
      } else {
        receive(data);
      }
    }
    root.addEventListener('message', onMessage);
    return {
      update: function (data) {
        if (frame.contentWindow) frame.contentWindow.postMessage(data, '*');
      },
      dispose: function () { root.removeEventListener('message', onMessage); }
    };
  }

  root.SB.ui.renderParts.starMapHost = { markup: markup, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
