/**
 * Page A/B tests. A test runs only while `active` is true; with none active the
 * site loads no split script, sends no `variant` field and has no A/B markup.
 * How it works: public/ab.js (picks the label before paint), src/lib/ab.ts (adds
 * it to analytics events), Base.astro (loads the script and the CSS), /privacy.
 *
 * To use one: wrap the two branches in elements marked data-ab="<key>:A" and
 * data-ab="<key>:B", then set `active: true`. Branch A is the default view.
 */
export interface Experiment {
  /** Lower-case words joined by hyphens. Also the data-ab-<key> attribute name. */
  key: string;
  active: boolean;
}

export const experiments: Experiment[] = [
  // Homepage hero test (STAA-450 part 2). Not wired yet.
  { key: 'home-hero', active: false },
];

export function activeExperimentKeys(list: Experiment[] = experiments): string[] {
  return list.filter((e) => e.active).map((e) => e.key);
}
