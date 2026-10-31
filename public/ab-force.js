/*
 * Test-only override for the A/B split. Base.astro loads this (before ab.js) only
 * in builds made with STAYPUT_AB_TEST set; production builds never reference it.
 * Address `?ab=home-hero:B` (or several, comma-joined) stores that pick for this tab,
 * which public/ab.js then uses instead of a random one.
 */
(function () {
  var m = /[?&]ab=([^&#]*)/.exec(location.search);
  if (!m) return;
  var parts = decodeURIComponent(m[1]).split(',');
  for (var i = 0; i < parts.length; i++) {
    var kv = /^([a-z0-9]+(?:-[a-z0-9]+)*):([AB])$/.exec(parts[i]);
    if (!kv) continue;
    try { sessionStorage.setItem('stayput:ab:' + kv[1], kv[2]); } catch (e) { /* pick stays random */ }
  }
})();
