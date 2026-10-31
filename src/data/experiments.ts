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

/**
 * Test and screenshot builds can switch tests on without editing this file:
 * STAYPUT_AB_TEST=home-hero (comma-separated keys). Production builds never set it.
 * The same variable also makes Base.astro load public/ab-force.js, which reads
 * `?ab=<key>:B` from the address and sets this tab's pick (see that file).
 */
const testKeys = (process.env.STAYPUT_AB_TEST ?? '').split(',').map((k) => k.trim()).filter(Boolean);
export const abForceAllowed = testKeys.length > 0;

export const experiments: Experiment[] = [
  // Homepage hero test (STAA-452): B has a one-line lede and moves the network-tab demo
  // down to just before the spec sheet. Switch on with `active: true` once approved.
  { key: 'home-hero', active: true || testKeys.includes('home-hero') },
];

export function activeExperimentKeys(list: Experiment[] = experiments): string[] {
  return list.filter((e) => e.active).map((e) => e.key);
}
