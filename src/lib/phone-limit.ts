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

/** The warning for a video too big to caption reliably on a phone, or '' when there is nothing to say. */
export function phoneLimitNote(bytes: number, phone = isPhoneBrowser()): string {
  if (!phone || bytes <= PHONE_SAFE_BYTES) return '';
  return `This video is ${formatBytes(bytes)}. A phone can run out of memory captioning more than about 200 MB (around 2 minutes of iPhone video, or 30 seconds at 4K). Trim it first, or use a computer.`;
}
