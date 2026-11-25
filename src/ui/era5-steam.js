/* ERA5 · intermittent hull exhaust. Pause outside the viewport and when the tab is hidden. */
(function (root) {
  'use strict';

  var doc = root.document;
  var ventPanel = doc && doc.getElementById('card-res');
  if (!ventPanel) return;

  var hasObserver = typeof root.IntersectionObserver === 'function';
  var isInView = !hasObserver;
  function syncSteamState() {
    ventPanel.classList.toggle('era5-steam-active', isInView && !doc.hidden);
  }

  if (!hasObserver) {
    syncSteamState();
    doc.addEventListener('visibilitychange', syncSteamState);
    return;
  }

  var observer = new root.IntersectionObserver(function (entries) {
    isInView = !!(entries[0] && entries[0].isIntersecting);
    syncSteamState();
  }, { rootMargin: '48px 0px', threshold: 0 });

  observer.observe(ventPanel);
  doc.addEventListener('visibilitychange', syncSteamState);
})(typeof window !== 'undefined' ? window : this);
