import { isPhoneBrowser } from './phone-limit';

/**
 * Which way the speech model runs.
 *
 * - 8-bit: Whisper base with 8-bit weights, all on WebAssembly. Every browser can do it; it is what
 *   this site has always served, and the fallback for everything below.
 * - WebGPU: the same model with its encoder in 16-bit floats on the graphics chip and the same 8-bit
 *   decoder on WebAssembly. Measured to write the same words about twice as fast in Chrome and
 *   Safari 27 on a computer, for a bigger first download (see SPEECH_DOWNLOAD).
 *
 * This file is the one switch. To turn the WebGPU path off for everybody, set WEBGPU_CAPTIONS to false.
 */
export const WEBGPU_CAPTIONS = true;

/**
 * Phones and tablets: not measured on a real device, so they stay on the 8-bit path. iPhones and iPads
 * run captions at about 1.1-1.7 GB of memory already, and Safari does not say how much memory a device has.
 */
export const WEBGPU_CAPTIONS_ON_PHONES = false;

/** Computers that report less memory than this (in GB; Chrome rounds down to a power of two, up to 8) stay on the 8-bit path. */
export const WEBGPU_MIN_DEVICE_MEMORY_GB = 4;

/** The name that turns the WebGPU path off in the address (`?webgpu=0`) or in localStorage (`stayput-webgpu`, set to `0`). */
export const WEBGPU_OVERRIDE = 'webgpu';
/** Set by the page when the WebGPU path failed on this device: the time of the failure. It is tried again a week later. */
const FAILED_KEY = 'stayput-webgpu-failed';
const RETRY_AFTER_MS = 7 * 24 * 3600 * 1000;

interface Env {
  search: string;
  store?: Pick<Storage, 'getItem' | 'setItem'>;
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { gpu?: unknown; deviceMemory?: number };
  now: number;
}

function environment(): Env {
  let store: Storage | undefined;
  try {
    store = localStorage;
  } catch {
    // Storage blocked: no override and no memory of failures.
  }
  return { search: location.search, store, nav: navigator as Env['nav'], now: Date.now() };
}

/** The forced setting from the address or storage, if there is one: '0' is off. */
function forcedOff(env: Env): boolean {
  const query = new URLSearchParams(env.search).get(WEBGPU_OVERRIDE);
  if (query !== null) return query === '0';
  try {
    return env.store?.getItem(`stayput-${WEBGPU_OVERRIDE}`) === '0';
  } catch {
    return false;
  }
}

/** Whether to try the WebGPU path at all. The worker still probes for a real adapter and device before it loads anything. */
export function wantsWebgpu(env: Env = environment()): boolean {
  if (!WEBGPU_CAPTIONS || forcedOff(env)) return false;
  if (!('gpu' in env.nav) || !env.nav.gpu) return false;
  if (isPhoneBrowser(env.nav) && !WEBGPU_CAPTIONS_ON_PHONES) return false;
  if (typeof env.nav.deviceMemory === 'number' && env.nav.deviceMemory < WEBGPU_MIN_DEVICE_MEMORY_GB) return false;
  try {
    const failed = Number(env.store?.getItem(FAILED_KEY));
    if (failed && env.now - failed < RETRY_AFTER_MS) return false;
  } catch {
    // ignore
  }
  return true;
}

/** Remember that the WebGPU path did not work here, so the next visits go straight to the 8-bit path. */
export function rememberWebgpuFailure(env: Env = environment()): void {
  try {
    env.store?.setItem(FAILED_KEY, String(env.now));
  } catch {
    // ignore
  }
}
