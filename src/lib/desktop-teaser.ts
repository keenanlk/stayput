/**
 * Painted-door test for a possible desktop app: after a successful run of the video background, subtitle or
 * transcription tools, on a desktop browser, one plain line under the results links to /desktop. It reads nothing
 * from the visitor, stores nothing and sends nothing; the only signal is the page view of /desktop and its
 * thank-you pages. To remove the test, revert the change that added this file (or set DESKTOP_TEST to false).
 */
import { isPhoneBrowser } from './phone-limit';

export const DESKTOP_TEST = true;

/** The page's own slug (not the tool a preset is built on). */
export const DESKTOP_TEST_SLUGS = [
  'remove-background-noise-from-video',
  'video-background-remover',
  'video-to-subtitles',
  'burn-subtitles-into-video',
  'auto-caption-video',
  'add-subtitles-to-video',
  'video-to-text',
  'transcribe',
  'audio-to-text',
];

const DESKTOP_QUERY = '(min-width: 900px) and (hover: hover) and (pointer: fine)';

export function mountDesktopTeaser(root: HTMLElement): { hide(): void } {
  const results = document.getElementById('results');
  const slug = root.dataset.slug ?? '';
  if (!DESKTOP_TEST || !results || !DESKTOP_TEST_SLUGS.includes(slug)) return { hide() {} };
  let line: HTMLParagraphElement | undefined;
  const hide = () => {
    line?.remove();
    line = undefined;
  };
  root.addEventListener('stayput:done', () => {
    hide();
    // Never next to an error (a run that finished but skipped some files shows one).
    if (document.getElementById('error')?.classList.contains('is-active')) return;
    if (isPhoneBrowser() || !window.matchMedia(DESKTOP_QUERY).matches) return;
    line = document.createElement('p');
    line.className = 'hint support-note';
    line.id = 'desktop-teaser';
    line.append('Want this faster, and for whole folders at a time? ');
    const a = document.createElement('a');
    a.href = '/desktop';
    a.textContent = "We're considering a desktop app →";
    line.append(a);
    results.append(line);
  });
  return { hide };
}
