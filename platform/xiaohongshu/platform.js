/* Xiaohongshu MiniTool runtime marker. Copied only into the XHS package. */
(function (root) {
  'use strict';
  root.shellbreakPlatform = {
    runtime: 'xiaohongshu',
    localizationEnabled: false,
    testUnlockStarMap: !!(document.currentScript && document.currentScript.hasAttribute('data-test-unlock-star-map')),
    /* Set true only after the MiniTool publish config shows reward is enabled. */
    rewardAuthorEnabled: false
  };
  document.addEventListener('DOMContentLoaded', function () {
    if (root.SB && root.SB.CFG && root.SB.CFG.AUDIO) root.SB.CFG.AUDIO.enabled = false;
    var heading = document.querySelector('[data-i18n="ui.settings.music.title"]');
    if (heading) heading.hidden = true;
    ['audioMuteToggle', 'audioVolume', 'audioTrackSelect'].forEach(function (id) {
      var control = document.getElementById(id);
      if (control && control.parentNode) control.parentNode.hidden = true;
    });
    var nowPlaying = document.getElementById('audioNowPlaying');
    if (nowPlaying) nowPlaying.hidden = true;
  });
})(window);
