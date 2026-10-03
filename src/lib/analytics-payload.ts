/**
 * What the Umami tracker may send. The tracker adds its own fields to every
 * event (screen size, language, page title, the full external referrer, an
 * optional id and tag); the loader points Umami's data-before-send hook at
 * this function so only the fields listed on /privacy leave the browser.
 */
export const BEFORE_SEND_HOOK = 'stayputBeforeSend';

type Payload = Record<string, unknown>;

/** The page path alone: no origin, no query string, no fragment. */
function pathOnly(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    return new URL(url, 'https://stayput.dev').pathname;
  } catch {
    return undefined;
  }
}

/**
 * Called by Umami with (type, payload); the returned payload is sent, a falsy
 * return sends nothing. Only page views and custom events are sent; they keep
 * the site id, hostname, page path and, for custom events, the name and data.
 */
export function beforeSend(type: string, payload: Payload): Payload | null {
  if (type !== 'event' || !payload) return null;
  const out: Payload = { website: payload.website, hostname: payload.hostname, url: pathOnly(payload.url) };
  if (payload.name !== undefined) out.name = payload.name;
  if (payload.data !== undefined) out.data = payload.data;
  return out;
}
