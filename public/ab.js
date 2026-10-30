/*
 * A/B split, one label per visit. Loaded in the <head> as a blocking script
 * (see Base.astro) only while an experiment in src/data/experiments.ts is
 * active, so the branch is chosen before the page paints.
 *
 * For each active key it picks "A" or "B" at random (crypto.getRandomValues,
 * 50/50) on the first page of the visit, keeps it in this tab's sessionStorage
 * ("stayput:ab:<key>"), and sets data-ab-<key>="A"|"B" on <html>. Base.astro
 * adds the CSS that shows the matching branch (elements marked data-ab="<key>:A"
 * or "<key>:B"). No cookie, no localStorage, no id; a new tab or visit picks again.
 * If sessionStorage throws, the pick lasts for this page only. If there is no
 * crypto, nothing is set and the page shows branch A without a label.
 */
(function () {
  var meta = document.querySelector('meta[name="stayput-ab"]');
  if (!meta) return;
  var keys = (meta.getAttribute('content') || '').split(',');
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i].replace(/^\s+|\s+$/g, '');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) continue;
    var v = pick(key);
    if (v) document.documentElement.setAttribute('data-ab-' + key, v);
  }
  function pick(key) {
    var name = 'stayput:ab:' + key;
    var v = null;
    try { v = sessionStorage.getItem(name); } catch (e) { v = null; }
    if (v === 'A' || v === 'B') return v;
    if (!(window.crypto && window.crypto.getRandomValues)) return null;
    v = window.crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 'B' : 'A';
    try { sessionStorage.setItem(name, v); } catch (e) { /* kept for this page only */ }
    return v;
  }
})();
