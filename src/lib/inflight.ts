/**
 * One marker for "a run or a preview is going on in this tab". A tab the browser kills for memory (iOS), or discards
 * while hidden, runs no code on the way out, so the next page load finds the marker still there and records the loss.
 * A tab that is left normally runs `pagehide` first, which clears it and records that the visitor left.
 * Stored: the tool's slug, the phase, the time and the input's total size (sent only as the existing size bucket). Nothing else about the file is stored or sent, and the marker never leaves the device.
 */
import { trackToolRun } from './analytics';
import { CAPTION_TOOLS, CUT_TOOLS, noteLostCut, noteLostFamily, noteLostRun } from './working-size';
import { familyOf } from './tool-family';
import { rememberTinyModel } from './speech-path';

/**
 * Where the marker lives. sessionStorage survives a reload of the same tab and is gone with the tab. If a phone turns out
 * to lose it when the browser kills the page, change this to 'local' (the 15-minute window below keeps a stale one harmless).
 */
export const INFLIGHT_STORE = 'session' as 'session' | 'local';
const KEY = 'stayput:inflight';
/** A marker older than this is a tab left open and forgotten, not a lost run. */
export const MAX_AGE_MS = 15 * 60_000;

export type Phase = 'run' | 'preview';
interface Marker {
  tool: string;
  phase: Phase;
  t: number;
  hidden: boolean;
  /** Which page load wrote this marker (random, per load): a duplicated tab copies sessionStorage, and the original page may still be running. */
  owner?: string;
  /** Size of the input, so the loss is recorded under the same `input` size bucket as the run's other outcomes. Stays on this device. */
  bytes?: number;
}

const store = (): Storage | undefined => {
  try {
    return INFLIGHT_STORE === 'local' ? localStorage : sessionStorage;
  } catch {
    return undefined;
  }
};

function read(): Marker | undefined {
  try {
    const m = JSON.parse(store()?.getItem(KEY) ?? 'null') as Marker | null;
    return m && (m.owner === undefined || (typeof m.owner === 'string' && /^[a-z0-9]{8,32}$/.test(m.owner))) && typeof m.tool === 'string' && /^[a-z0-9-]{1,60}$/.test(m.tool) && (m.phase === 'run' || m.phase === 'preview') && typeof m.t === 'number' ? m : undefined;
  } catch {
    return undefined;
  }
}

function write(m: Marker) {
  try {
    store()?.setItem(KEY, JSON.stringify(m));
  } catch {
    // Storage may be full or blocked; the marker is best effort.
  }
}

function remove() {
  try {
    store()?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** How long a run had been going when the visitor left: six coarse steps, never the milliseconds. */
export function leftAfterBucket(ms: number): string {
  if (ms < 10_000) return '<10s';
  if (ms < 30_000) return '10-30s';
  if (ms < 60_000) return '30-60s';
  if (ms < 180_000) return '1-3m';
  if (ms < 600_000) return '3-10m';
  return '>10m';
}

/** How far along a run was (a fraction from 0 to 1) when the visitor left. */
export function leftAtBucket(fraction: number): string {
  const pct = Math.floor(Math.min(1, Math.max(0, fraction)) * 100);
  if (pct <= 0) return '0';
  if (pct <= 25) return '1-25';
  if (pct <= 50) return '26-50';
  if (pct <= 75) return '51-75';
  return '76-99';
}

/** What a tool says about its run in progress, so that leaving it can be told apart by mode. Held in memory only. */
let detail: { mode?: string; fraction: number } | undefined;

/** A tool that wants LeftDuringRun to say how far it got, and in which mode, calls this as it goes (see markInflight). */
export function noteRunDetail(d: { mode?: string; fraction?: number }): void {
  detail = { mode: d.mode ?? detail?.mode, fraction: d.fraction ?? detail?.fraction ?? 0 };
}

function send(tool: string, errorClass: string, extra: { leftAfter?: string; leftAt?: string; mode?: string } = {}, inputBytes = 0) {
  trackToolRun({ tool, outcome: 'error', files: 1, inputBytes, ms: 0, errorClass, ...extra });
}

/** This page load's id, and the lock it holds while a marker it wrote is in place (see ownerIsAlive). */
const PAGE_ID = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
const LOCK_PREFIX = 'stayput-inflight-';
let releaseLock: (() => void) | undefined;

/** Holds a Web Lock named for this page while its marker stands. The browser drops the lock when the page dies, which is how a later load can tell a killed page from one that is still running. */
function holdLock() {
  if (releaseLock || typeof navigator === 'undefined' || !navigator.locks) return;
  try {
    void navigator.locks
      .request(LOCK_PREFIX + PAGE_ID, () => new Promise<void>((resolve) => (releaseLock = resolve)))
      .catch(() => undefined);
  } catch {
    // No lock: a duplicated tab may be counted as a lost run, which is how it was before.
  }
}
function dropLock() {
  releaseLock?.();
  releaseLock = undefined;
}

/**
 * Whether the page that wrote this marker is still running. "Duplicate tab" (and a link opened with its opener) copies this tab's
 * sessionStorage, marker included, into a tab whose original is alive and well: that is no lost run. A killed page's lock is gone.
 */
async function ownerIsAlive(owner: string | undefined): Promise<boolean> {
  if (!owner || owner === PAGE_ID || typeof navigator === 'undefined' || !navigator.locks?.query) return false;
  try {
    const held = await navigator.locks.query();
    return !!held.held?.some((l) => l.name === LOCK_PREFIX + owner);
  } catch {
    return false;
  }
}

let current: { tool: string; phase: Phase } | undefined;
let wired = false;
/** True once the page has started to be left (`beforeunload`, then `pagehide`), until it is shown again. */
let leaving = false;
let gone = false;

/**
 * Whether the page is being left. Navigation cancels a download or a worker the run is waiting on, and WebKit rejects that
 * promise before it fires `pagehide`: a run's failure handler that recorded the error would count the visitor leaving as a
 * failure, and the marker it cleared would leave `pagehide` nothing to record. `beforeunload` comes first, so by then this is true.
 */
export function pageIsBeingLeft(): boolean {
  return leaving;
}

function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('visibilitychange', () => {
    const m = read();
    if (m && current) write({ ...m, hidden: document.hidden });
  });
  // The page is going away on purpose (or being frozen): it is not a lost run, so the marker goes and the visitor leaving is recorded.
  addEventListener('beforeunload', () => {
    leaving = true;
    // Something may still call the leave off; a page that is not gone a few seconds on is staying.
    setTimeout(() => {
      if (!gone) leaving = false;
    }, 5000);
  });
  addEventListener('pageshow', () => {
    leaving = false;
    gone = false;
  });
  addEventListener('pagehide', () => {
    leaving = gone = true;
    if (!current) return;
    const { tool, phase } = current;
    current = undefined;
    // A preview too quick to have been marked is not worth a record.
    const m = read();
    const d = detail;
    remove();
    dropLock();
    if (!m) return;
    if (phase === 'run' && d) send(tool, 'LeftDuringRun', { leftAfter: leftAfterBucket(Date.now() - m.t), leftAt: leftAtBucket(d.fraction), ...(d.mode ? { mode: d.mode } : {}) }, m.bytes);
    else send(tool, phase === 'run' ? 'LeftDuringRun' : 'LeftDuringPreview', {}, m.bytes);
  });
}

/**
 * A preview that ends within this long never touches storage. The marker is for work long enough for a phone to run out of
 * memory in; and WebKit's storage calls wait on another process, which can stall a page that is busy opening a media file.
 */
export const PREVIEW_MARK_DELAY_MS = 1500;

/** Marks a run or preview as started. Call the returned function when it ends, however it ends. */
export function markInflight(tool: string, phase: Phase, bytes?: number): () => void {
  wire();
  const mine = { tool, phase };
  current = mine;
  detail = undefined;
  const put = () => {
    if (current !== mine) return;
    write({ tool, phase, t: Date.now(), hidden: typeof document !== 'undefined' && document.hidden, owner: PAGE_ID, ...(bytes && bytes > 0 ? { bytes } : {}) });
    holdLock();
  };
  const timer = phase === 'preview' ? setTimeout(put, PREVIEW_MARK_DELAY_MS) : undefined;
  if (!timer) put();
  const finish = () => {
    if (current !== mine) return;
    current = undefined;
    detail = undefined;
    remove();
    dropLock();
  };
  return () => {
    clearTimeout(timer);
    // The run ended because the page is being left: leave the marker for `pagehide`. If the leave was called off, the marker goes a moment later.
    if (leaving) setTimeout(finish, 1000);
    else finish();
  };
}

/** The tools whose speech model starts smaller after a lost run: the slugs stored for them. */
export const SPEECH_TOOLS = ['transcribe', 'video-to-subtitles', 'auto-caption-video', 'add-subtitles-to-video'];

/** At page load: a marker left by an earlier load of this tab means that tab died mid-work. Records it once and clears it. */
export function reportLostTab(): Promise<void> | void {
  const m = read();
  if (!m) return;
  remove();
  if (Date.now() - m.t > MAX_AGE_MS || m.t > Date.now() + 60_000) return;
  // A marker copied into a duplicated tab belongs to a page that is still running; only a marker whose page is gone is a lost run.
  if (m.owner && typeof navigator !== 'undefined' && !!navigator.locks?.query) {
    return ownerIsAlive(m.owner).then((alive) => {
      if (!alive) record(m);
    });
  }
  record(m);
}

function record(m: Marker): void {
  const cls = m.hidden ? 'TabLostWhileHidden' : m.phase === 'run' ? 'TabLostDuringRun' : 'TabLostDuringPreview';
  // A caption run the browser closed: the redraw starts smaller in this tab (see capAtRisk). Kept as a flag in this tab; nothing more is sent.
  if (cls === 'TabLostDuringRun' && CAPTION_TOOLS.includes(m.tool)) noteLostRun();
  // A split the browser closed: this tab's next split copies each part from its key frame instead of re-encoding. A flag in this tab only.
  if (m.phase === 'run' && CUT_TOOLS.includes(m.tool)) noteLostCut();
  // A speech run the browser closed (on a phone, most likely out of memory): this tab's next speech run starts with the smaller model. A flag in this tab only.
  if (m.phase === 'run' && SPEECH_TOOLS.includes(m.tool)) rememberTinyModel();
  // The shared record: every heavy tool of this family starts lighter on its next run in this tab (see light-run.ts). A flag only; a preview is not a lost run.
  const family = familyOf(m.tool);
  if (m.phase === 'run' && family) noteLostFamily(family);
  send(m.tool, cls, {}, typeof m.bytes === 'number' ? m.bytes : 0);
}
