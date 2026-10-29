/**
 * Reads this visit's A/B label for analytics. public/ab.js picks it before the
 * page paints and sets data-ab-<key>="A"|"B" on <html>; Base.astro lists the
 * active keys in <meta name="stayput-ab">. With no experiment active there is
 * no meta, so this returns undefined and events carry no `variant` field.
 *
 * Format: "<key>:A" or "<key>:B"; several experiments at once are joined with a
 * comma ("home-hero:A,tool-layout:B"). Keyed, so the label stays unambiguous
 * when more than one test runs.
 */
export function abVariant(): string | undefined {
  try {
    const keys = (document.querySelector('meta[name="stayput-ab"]')?.getAttribute('content') ?? '').split(',');
    const labels: string[] = [];
    for (const raw of keys) {
      const key = raw.trim();
      const v = key ? document.documentElement.getAttribute(`data-ab-${key}`) : null;
      if (v === 'A' || v === 'B') labels.push(`${key}:${v}`);
    }
    return labels.length ? labels.join(',') : undefined;
  } catch {
    return undefined;
  }
}

/** The CSS that shows one branch: A is the default view; B shows only when this visit is in B. */
export function abCss(keys: string[]): string {
  return keys
    .map((k) => `html:not([data-ab-${k}="B"]) [data-ab="${k}:B"],html[data-ab-${k}="B"] [data-ab="${k}:A"]{display:none}`)
    .join('');
}
