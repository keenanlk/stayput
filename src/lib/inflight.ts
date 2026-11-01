/**
 * One marker for "a run or a preview is going on in this tab". A tab the browser kills for memory (iOS), or discards
 * while hidden, runs no code on the way out, so the next page load finds the marker still there and records the loss.
 * A tab that is left normally runs `pagehide` first, which clears it and records that the visitor left.
 * Stored: the tool's slug, the phase and the time. Nothing about the file is stored or sent, and the marker never leaves the device.
 */
import { trackToolRun } from './analytics';
import { CAPTION_TOOLS, noteLostRun } from './working-size';

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
    return m && typeof m.tool === 'string' && /^[a-z0-9-]{1,60}$/.test(m.tool) && (m.phase === 'run' || m.phase === 'preview') && typeof m.t === 'number' ? m : undefined;
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

function send(tool: string, errorClass: string) {
  trackToolRun({ tool, outcome: 'error', files: 1, inputBytes: 0, ms: 0, errorClass });
}

let current: { tool: string; phase: Phase } | undefined;
let wired = false;

function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('visibilitychange', () => {
    const m = read();
    if (m && current) write({ ...m, hidden: document.hidden });
  });
  // The page is going away on purpose (or being frozen): it is not a lost run, so the marker goes and the visitor leaving is recorded.
  addEventListener('pagehide', () => {
    if (!current) return;
    const { tool, phase } = current;
    current = undefined;
    // A preview too quick to have been marked is not worth a record.
    const marked = read() !== undefined;
    remove();
    if (marked) send(tool, phase === 'run' ? 'LeftDuringRun' : 'LeftDuringPreview');
  });
}

/**
 * A preview that ends within this long never touches storage. The marker is for work long enough for a phone to run out of
 * memory in; and WebKit's storage calls wait on another process, which can stall a page that is busy opening a media file.
 */
export const PREVIEW_MARK_DELAY_MS = 1500;

/** Marks a run or preview as started. Call the returned function when it ends, however it ends. */
export function markInflight(tool: string, phase: Phase): () => void {
  wire();
  const mine = { tool, phase };
  current = mine;
  const put = () => current === mine && write({ tool, phase, t: Date.now(), hidden: typeof document !== 'undefined' && document.hidden });
  const timer = phase === 'preview' ? setTimeout(put, PREVIEW_MARK_DELAY_MS) : undefined;
  if (!timer) put();
  return () => {
    clearTimeout(timer);
    if (current !== mine) return;
    current = undefined;
    remove();
  };
}

/** At page load: a marker left by an earlier load of this tab means that tab died mid-work. Records it once and clears it. */
export function reportLostTab(): void {
  const m = read();
  if (!m) return;
  remove();
  if (Date.now() - m.t > MAX_AGE_MS || m.t > Date.now() + 60_000) return;
  const cls = m.hidden ? 'TabLostWhileHidden' : m.phase === 'run' ? 'TabLostDuringRun' : 'TabLostDuringPreview';
  // A caption run the browser closed: the redraw starts smaller in this tab (see capAtRisk). Kept as a flag in this tab; nothing more is sent.
  if (cls === 'TabLostDuringRun' && CAPTION_TOOLS.includes(m.tool)) noteLostRun();
  send(m.tool, cls);
}
