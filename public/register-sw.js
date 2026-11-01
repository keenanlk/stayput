// Registers the offline service worker. Kept as a plain file so it works
// under the strict Content-Security-Policy (no inline scripts).
// Automated browsers (navigator.webdriver) don't install the offline cache: each fresh
// context would precache every page. Tests that need the worker set window.__stayputAllowSW.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && (navigator.webdriver !== true || window.__stayputAllowSW === true)) {
  window.addEventListener('load', () => {
    // A page opened before the worker controlled it was never stored by the worker, so hand it over once the worker is active.
    const uncontrolled = !navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => (uncontrolled ? navigator.serviceWorker.ready : null))
      .then((reg) => reg && reg.active && reg.active.postMessage({ type: 'cache-page', path: location.pathname + location.search }))
      .catch(() => {});
  });
}
