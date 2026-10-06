// Which pages changed between two versions of src/data/lastmod.json (see scripts/lastmod.mjs).
// A page counts as changed when it is new or its date or content hash differs; removed pages
// are not submitted. Returns absolute URLs, sorted.
export function changedUrls(previous, next, site) {
  const urls = [];
  for (const [path, entry] of Object.entries(next ?? {})) {
    const old = previous?.[path];
    if (!old || old.date !== entry.date || old.hash !== entry.hash) urls.push(path === '/' ? `${site}/` : `${site}${path}`);
  }
  return urls.sort();
}
