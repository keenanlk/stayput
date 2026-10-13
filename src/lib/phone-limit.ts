import { formatBytes } from './files';

/**
 * How big a video can be for the caption tools on a phone. Measured in Safari on an iPhone 16 Pro (iOS 18.4
 * Simulator) against a budget of 1.5 GB for the tab: reading the sound and running the speech model needs
 * memory in step with the file's size, and 1080p30 iPhone video (about 190 MB for two minutes, or 30 seconds at 4K)
 * stays inside it while larger files do not.
 */
export const PHONE_SAFE_BYTES = 200_000_000;

/** An iPhone, iPad or Android phone or tablet (iPadOS Safari says it is a Mac, so the touch screen gives it away). */
export function isPhoneBrowser(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): boolean {
  return /iPhone|iPad|iPod|Android/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** An iPhone or iPad only (not Android); iPadOS Safari reports itself as a Mac, so touch gives it away. */
export function isIosBrowser(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** A video bigger than a phone can caption reliably, on a phone. */
export const overPhoneLimit = (bytes: number, phone = isPhoneBrowser()): boolean => phone && bytes > PHONE_SAFE_BYTES;

/** The warning for a video too big to caption reliably on a phone, or '' when there is nothing to say. */
export function phoneLimitNote(bytes: number, phone = isPhoneBrowser()): string {
  if (!overPhoneLimit(bytes, phone)) return '';
  return `This video is ${formatBytes(bytes)}. A phone can run out of memory captioning more than about 200 MB (around 2 minutes of iPhone video, or 30 seconds at 4K). Trim it first, or use a computer.`;
}

/** The link in the warning above: a trim is the way to get a long video under the limit. */
export const TRIM_LINK = { text: 'Trim it first', href: '/tools/trim-video' };

/** Shown above Run before any run, so the download is no surprise on mobile data. */
export const MODEL_DOWNLOAD_NOTE = 'The first run downloads the speech model, about 76 MB, once.';
