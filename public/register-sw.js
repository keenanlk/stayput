// Registers the offline service worker. Kept as a plain file so it works
// under the strict Content-Security-Policy (no inline scripts).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // The worker saves the app shell, the page being opened and a short list of popular pages.
  // The installed app (just installed, or opened from the home screen) saves every page.
  const saveAll = () => {
    navigator.serviceWorker.ready.then((reg) => reg.active && reg.active.postMessage({ type: 'save-all' })).catch(() => {});
  };
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) saveAll();
  });
  window.addEventListener('appinstalled', saveAll);
}
