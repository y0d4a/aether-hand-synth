/* Registers a local service worker for offline revisits. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope: './'}).catch(err => {
      console.warn('[AETHER] Offline cache unavailable:', err.message);
    });
  });
})();
