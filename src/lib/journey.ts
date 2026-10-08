/**
 * Anonymous journey context for usage events. Everything here is computed on
 * the device from coarse state kept in the browser's own storage:
 *
 * - sessionStorage (this tab only, gone when it closes): the page the visit
 *   entered on, the referring site's name, the previous page on this site,
 *   the last tool run in this tab, and a random experiment arm.
 * - localStorage (this device only): the date of the last visit, the date of
 *   the last successful run, and which tools have been used.
 *
 * None of that is sent as-is. Events carry site page paths (public URLs),
 * tool slugs, a named source like "google" or "direct", and day buckets.
 * There is no identifier, and nothing about files beyond the size buckets in
 * analytics.ts.
 */

const TAB_KEY = 'stayput:tab';
const LOCAL_KEY = 'stayput:local';
const VIA_KEY = 'stayput:via';

interface TabState {
  landing: string;
  ref: string;
  page: string;
  runs: number;
  lastTool?: string;
  /** Experiment E2 arm for this visit: next-step suggestions shown or not. */
  ns?: 'on' | 'off';
}
interface LocalState {
  lastVisit?: string;
  lastRun?: string;
  tools?: string[];
}

export interface Journey {
  /** First page of this visit (path). */
  landing: string;
  /** Where the visit came from: a known site name, "direct" or "other". */
  ref: string;
  /** Previous page on this site in this tab, or "(none)". */
  from: string;
  /** Days since the previous visit on this device, bucketed; "new" when none. */
  visit: string;
  /** True when this page load started a new visit (new tab session). */
  isNewVisit: boolean;
  /** Experiment E2 arm, assigned at random once per visit. */
  ns: 'on' | 'off';
  /** How this page was reached when the site knows: "search" after a header search pick (E18). */
  via?: string;
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.com$/, 'yahoo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
  [/(^|\.)search\.brave\.com$/, 'brave'],
  [/(^|\.)yandex\./, 'yandex'],
  [/(^|\.)kagi\.com$/, 'kagi'],
  [/(^|\.)startpage\.com$/, 'startpage'],
  [/(^|\.)qwant\.com$/, 'qwant'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'chatgpt'],
  [/(^|\.)claude\.ai$/, 'claude'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)news\.ycombinator\.com$/, 'hackernews'],
  [/(^|\.)producthunt\.com$/, 'producthunt'],
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)bsky\.app$/, 'bluesky'],
  [/(^|\.)(twitter|x)\.com$|^t\.co$/, 'x'],
  [/(^|\.)facebook\.com$/, 'facebook'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/(^|\.)dev\.to$/, 'devto'],
  [/(^|\.)alternativeto\.net$/, 'alternativeto'],
  [/(^|\.)indiehackers\.com$/, 'indiehackers'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  // Large Mastodon instances by exact host, plus any two-label host whose first label is mastodon, mstdn or masto (e.g. mastodon.xyz).
  [/^(?:mastodon\.social|mastodon\.online|fosstodon\.org|hachyderm\.io|mas\.to|infosec\.exchange|mstdn\.social|mastodon\.world|techhub\.social|universeodon\.com|mastodon\.art|mastodon\.ie|mastodon\.scot|mstdn\.ca|aus\.social|social\.vivaldi\.net|ioc\.exchange|sfba\.social|kolektiva\.social|toot\.community|chaos\.social|troet\.cafe|det\.social|mastodon\.nl|piaille\.fr|mamot\.fr|mastodon\.uno|mathstodon\.xyz|scholar\.social|tech\.lgbt|mastodon\.green|c\.im|phpc\.social|ruby\.social|front-end\.social|indieweb\.social|hci\.social|sigmoid\.social|dair-community\.social|journa\.host|newsie\.social|masto\.ai|mastodon\.sdf\.org)$|^(?:mastodon|mstdn|masto)\.[a-z]{2,}$/, 'mastodon'],
  [/^registry\.modelcontextprotocol\.io$/, 'mcpregistry'],
  [/(^|\.)glama\.ai$/, 'glama'],
  [/(^|\.)mcp\.so$/, 'mcpso'],
  [/(^|\.)smithery\.ai$/, 'smithery'],
  [/(^|\.)nologin\.tools$/, 'nologin'],
  [/(^|\.)openalternative\.co$/, 'openalternative'],
  [/(^|\.)opensourcealternative\.to$/, 'opensourcealternative'],
  [/(^|\.)uneed\.best$/, 'uneed'],
  [/(^|\.)peerlist\.io$/, 'peerlist'],
  [/^discuss\.privacyguides\.net$/, 'privacyguides'],
];

/** Name the referring site, or "direct"/"internal"/"other". Never returns a raw URL. */
export function sourceOf(referrer: string, ownHost: string): string {
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (host === ownHost) return 'internal';
  for (const [re, name] of SOURCES) if (re.test(host)) return name;
  return 'other';
}

/** Whole days between two local YYYY-MM-DD dates. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

/** Bucket the gap since a previous date: "new", "same-day", "1d", "2-7d", "8-30d", "31d+". */
export function gapBucket(previous: string | undefined, today: string): string {
  if (!previous) return 'new';
  const d = daysBetween(previous, today);
  if (!Number.isFinite(d) || d < 0) return 'new';
  if (d === 0) return 'same-day';
  if (d === 1) return '1d';
  if (d <= 7) return '2-7d';
  if (d <= 30) return '8-30d';
  return '31d+';
}

export function countBucket3(n: number): string {
  return n <= 1 ? '1' : n === 2 ? '2' : '3+';
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read<T>(store: Storage | undefined, key: string): T | undefined {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function write(store: Storage | undefined, key: string, value: unknown): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be blocked; events then report a new visit, which is fine.
  }
}
function storage(kind: 'sessionStorage' | 'localStorage'): Storage | undefined {
  try {
    return window[kind];
  } catch {
    return undefined;
  }
}

let current: Journey | undefined;

/** Record this page load (once per page) and return the visit context. */
export function journey(): Journey {
  if (current) return current;
  const session = storage('sessionStorage');
  const local = storage('localStorage');
  const path = location.pathname.replace(/\.html$/, '') || '/';
  const today = localDate();

  const tab = read<TabState>(session, TAB_KEY);
  const saved = read<LocalState>(local, LOCAL_KEY) ?? {};
  const isNewVisit = !tab;
  // The visit bucket is fixed when the visit starts, so every event in it agrees.
  const visit = isNewVisit ? gapBucket(saved.lastVisit, today) : (read<{ visit: string }>(session, TAB_KEY + ':visit')?.visit ?? 'new');
  const state: TabState = tab ?? { landing: path, ref: sourceOf(document.referrer, location.hostname), page: path, runs: 0 };
  const from = isNewVisit ? '(none)' : state.page;
  state.page = path;
  state.ns ??= Math.random() < 0.5 ? 'on' : 'off';
  write(session, TAB_KEY, state);
  if (isNewVisit) {
    write(session, TAB_KEY + ':visit', { visit });
    write(local, LOCAL_KEY, { ...saved, lastVisit: today });
  }
  // Set by markVia() on the page before; it describes this page load only.
  const via = read<string>(session, VIA_KEY);
  if (via) session?.removeItem(VIA_KEY);
  current = { landing: state.landing, ref: state.ref, from, visit, isNewVisit, ns: state.ns, ...(via ? { via } : {}) };
  return current;
}

/** Note how the next page in this tab is being reached ("search"); read once by journey() there. */
export function markVia(via: string): void {
  journey();
  write(storage('sessionStorage'), VIA_KEY, via);
}

/**
 * Context for a finished run, then remember it. Returns the previous tool run
 * in this tab, the run count in this tab, how many different tools this device
 * has used, and the gap since the last successful run on an earlier day.
 */
export function recordRun(tool: string, ok: boolean): { prevTool: string; runN: string; toolsUsed: string; runGap: string } {
  journey();
  const session = storage('sessionStorage');
  const local = storage('localStorage');
  const today = localDate();
  const tab = read<TabState>(session, TAB_KEY) ?? { landing: '(unknown)', ref: 'other', page: '', runs: 0 };
  const saved = read<LocalState>(local, LOCAL_KEY) ?? {};
  const prevTool = tab.lastTool ?? '(none)';
  const tools = new Set(saved.tools ?? []);
  if (ok) tools.add(tool);
  const out = {
    prevTool,
    runN: countBucket3(tab.runs + 1),
    toolsUsed: countBucket3(Math.max(1, tools.size)),
    runGap: gapBucket(saved.lastRun, today),
  };
  tab.runs += 1;
  if (ok) tab.lastTool = tool;
  write(session, TAB_KEY, tab);
  if (ok) write(local, LOCAL_KEY, { ...saved, lastRun: today, tools: [...tools] });
  return out;
}
