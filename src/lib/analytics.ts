/**
 * Privacy-preserving usage events. Umami (self-hosted, cookie-free) is loaded
 * by the page layout; this module only calls it if it is present. Events carry
 * the tool slug, an outcome, coarse buckets and the journey context from
 * journey.ts (site page paths, a named source, day buckets). Never file names,
 * exact sizes, types, contents or any identifier.
 *
 * Events:
 * - visit_start: once per visit (tab session). landing, ref, visit.
 * - files_added: first files dropped into a tool since the page loaded or the
 *   last run. tool, files, input, landing, ref, from, visit.
 * - tool_run: every run. The above plus outcome, output, duration, prev_tool,
 *   run_n, tools_used, run_gap, and attempt ("first-ok" on the first success
 *   since files_added, so completion rate = first-ok runs / files_added),
 *   and ns (experiment E2 arm, "on" or "off"). The image converter adds
 *   format, the output format picked ("ico"; never anything about the file).
 * - next_step: a click on a suggested next tool. tool, to, ns.
 * - search_open: the header search was opened. page.
 * - search_pick: a header search result was opened. to (a site path), kind
 *   (tool, page or guide), rank. Never the words typed, which stay on the page.
 *   files_added and tool_run on the page it opens carry via=search (E18).
 */
import { journey, recordRun } from './journey';
import { beforeSend, BEFORE_SEND_HOOK } from './analytics-payload';
declare global {
  interface Window {
    umami?: { track: (name: string, data?: Record<string, string | number>) => void };
  }
}

export function sizeBucket(bytes: number): string {
  if (bytes < 1_000_000) return '<1MB';
  if (bytes < 10_000_000) return '1-10MB';
  if (bytes < 50_000_000) return '10-50MB';
  if (bytes < 200_000_000) return '50-200MB';
  return '200MB+';
}

export function countBucket(n: number): string {
  if (n <= 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 20) return '6-20';
  if (n <= 100) return '21-100';
  return '100+';
}

export function durationBucket(ms: number): string {
  if (ms < 1000) return '<1s';
  if (ms < 5000) return '1-5s';
  if (ms < 30_000) return '5-30s';
  return '30s+';
}

const UMAMI_SRC = 'https://stats.keenankaufman.com/st.js';
const UMAMI_WEBSITE = '52e5e00a-c867-497a-9f44-14c769361768';

/**
 * Add the Umami script unless this visit should not be counted:
 * - automated browsers (Playwright, Puppeteer, Selenium set navigator.webdriver),
 *   so our own tests, audits and checks never count as visitors;
 * - browsers sending Global Privacy Control (Do Not Track is left to Umami, below);
 * - browsers opted out with stayput.dev/#notrack (sets Umami's own
 *   "umami.disabled" flag; #track undoes it).
 * Umami itself also drops known bot user agents and honours Do Not Track (data-do-not-track).
 * What is sent is limited by beforeSend (analytics-payload.ts).
 */
export function loadAnalytics(): void {
  try {
    if (location.hash === '#notrack' || location.hash === '#track') {
      const off = location.hash === '#notrack';
      if (off) localStorage.setItem('umami.disabled', '1');
      else localStorage.removeItem('umami.disabled');
      history.replaceState(null, '', location.pathname + location.search);
      alert(off ? 'Visits from this browser will not be counted.' : 'Visits from this browser will be counted again.');
    }
    if (navigator.webdriver || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl || localStorage.getItem('umami.disabled')) return;
  } catch {
    // Storage blocked: fall through and let Umami decide.
  }
  const s = document.createElement('script');
  s.defer = true;
  s.src = UMAMI_SRC;
  s.dataset.websiteId = UMAMI_WEBSITE;
  s.dataset.doNotTrack = 'true';
  s.dataset.domains = 'stayput.dev';
  // Keep the page path only, and drop screen, language, title, referrer, id and tag.
  s.dataset.excludeSearch = 'true';
  s.dataset.excludeHash = 'true';
  (window as unknown as Record<string, unknown>)[BEFORE_SEND_HOOK] = beforeSend;
  s.dataset.beforeSend = BEFORE_SEND_HOOK;
  document.head.append(s);
}

/** Send an event now, or once the deferred Umami script has loaded. */
export function track(name: string, data: Record<string, string | number>): void {
  const send = () => {
    try {
      window.umami?.track(name, data);
    } catch {
      // Analytics must never affect the tool.
    }
  };
  if (window.umami || document.readyState === 'complete') send();
  else window.addEventListener('load', send, { once: true });
}

/** Call on every page load; sends visit_start when the page starts a visit. */
export function trackPageContext(): void {
  try {
    const j = journey();
    if (j.isNewVisit) track('visit_start', { landing: j.landing, ref: j.ref, visit: j.visit });
  } catch {
    // Analytics must never affect the site.
  }
}

function context(): Record<string, string> {
  const j = journey();
  return { landing: j.landing, ref: j.ref, from: j.from, visit: j.visit, ...(j.via ? { via: j.via } : {}) };
}

/** Coarse error category for tool_run failures: the error's own name, never its message or stack. */
export function classifyError(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  // A class name only: letters and digits, short. Anything else (a name someone set to a sentence) is just "Error".
  if (/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name)) return name;
  return e instanceof Error ? 'Error' : 'Unknown';
}

export function trackFilesAdded(data: { tool: string; files: number; inputBytes: number }): void {
  try {
    track('files_added', { tool: data.tool, files: countBucket(data.files), input: sizeBucket(data.inputBytes), ...context() });
  } catch {
    // Analytics must never affect the tool.
  }
}

export function trackToolRun(data: { tool: string; outcome: 'ok' | 'error'; firstOk?: boolean; files: number; inputBytes: number; outputBytes?: number; ms: number; format?: string; errorClass?: string }): void {
  try {
    const run = recordRun(data.tool, data.outcome === 'ok');
    track('tool_run', {
      tool: data.tool,
      outcome: data.outcome,
      files: countBucket(data.files),
      input: sizeBucket(data.inputBytes),
      ...(data.outputBytes !== undefined ? { output: sizeBucket(data.outputBytes) } : {}),
      duration: durationBucket(data.ms),
      ...(data.format ? { format: data.format } : {}),
      ...(data.outcome === 'ok' ? { attempt: data.firstOk ? 'first-ok' : 'repeat' } : {}),
      ...(data.errorClass ? { error_class: data.errorClass } : {}),
      ...context(),
      prev_tool: run.prevTool,
      run_n: run.runN,
      tools_used: run.toolsUsed,
      run_gap: run.runGap,
      ns: journey().ns,
    });
  } catch {
    // Analytics must never affect the tool.
  }
}
