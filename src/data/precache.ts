/**
 * What the service worker (src/pages/sw.js.ts) saves for offline use.
 *
 * A first visit saves the app shell (the shared script, styles and fonts), the page being
 * opened with every script, worker and style it can load on demand, and the pages below.
 * Every other page is saved when it is opened. Installing the app (or opening it from the
 * home screen) saves all pages and scripts. Saved pages survive deploys: after a deploy only
 * the pages whose content changed are fetched again.
 */

/**
 * Rollback switch. Set STAYPUT_FULL_PRECACHE=1 for the build (or change this constant) to
 * go back to the earlier behaviour: the first visit saves every page and script. The page
 * cache still survives deploys in that mode, so a returning visitor refetches only the
 * pages that changed.
 */
export const FULL_PRECACHE_ON_FIRST_VISIT = process.env.STAYPUT_FULL_PRECACHE === '1';

/**
 * Pages saved on every first visit, after the visited page. The most visited pages of the
 * last 28 days; keep it to 10 to 20 entries, each costs one request per first visit.
 */
export const TOP_PAGES: string[] = [
  '/',
  '/burn-subtitles-into-video',
  '/video-to-subtitles',
  '/blur-video-background',
  '/tools/add-subtitles-to-video',
  '/auto-caption-video',
  '/tools/blur-face-video',
  '/tools/remove-noise',
  '/instagram-carousel-splitter',
  '/tools/resize-video',
  '/image-to-pixel-art',
  '/tools/volume-booster',
  '/crop-image-to-circle',
  '/tools/compress-pdf',
  '/remove-text-from-image',
];
