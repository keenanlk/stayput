/**
 * Search engine ownership tokens. Each is the `content` value of the
 * verification meta tag the engine gives you; leave empty until one exists.
 * Base.astro renders a tag only when its value is set.
 */
export const siteVerification = {
  /** Google Search Console, HTML tag method: <meta name="google-site-verification" content="..."> */
  google: '',
  /** Bing Webmaster Tools, HTML tag method: <meta name="msvalidate.01" content="...">. Not needed when importing from Search Console. */
  bing: '',
};

/** IndexNow key. The same value is served at /<key>.txt (public/) and used by scripts/indexnow.mjs. */
export const indexNowKey = 'ce50fbcd4b1e3ea6661da3979e0be697';

/**
 * Official profiles, listed as schema.org sameAs so search engines tie them to
 * the site. Reserved to protect the name; only Bluesky is actively posted to.
 */
export const profiles = [
  'https://github.com/keenanlk/stayput',
  'https://www.facebook.com/stayputdev',
  'https://www.instagram.com/stayputdev/',
  'https://x.com/stayputdev',
  'https://www.youtube.com/@stayputdev',
];
