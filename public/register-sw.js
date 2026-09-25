// Registers the offline service worker. Kept as a plain file so it works
// under the strict Content-Security-Policy (no inline scripts).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
