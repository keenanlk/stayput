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
 * Phones and tablets: not measured on a real device, so they stay on the 8-bit path unless the address
 * says `?webgpu=1` (or storage `stayput-webgpu` is `1`). iPhones and iPads run captions at about
 * 1.1-1.7 GB of memory already, and Safari does not say how much memory a device has.
 */
export const WEBGPU_CAPTIONS_ON_PHONES = false;

/** Computers that report less memory than this (in GB; Chrome rounds down to a power of two, up to 8) stay on the 8-bit path. */
export const WEBGPU_MIN_DEVICE_MEMORY_GB = 4;

/**
 * The name that sets the path in the address or in localStorage (`stayput-webgpu`): `0` turns the WebGPU path off,
 * `1` opts a phone or tablet in (the worker's probe for WebGPU and shader-f16 and the fall back to 8-bit still apply).
 */
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

/** The setting forced from the address (first) or storage, if there is one: '0' is off, '1' is on even for a phone. */
function forced(env: Env): string | null {
  const query = new URLSearchParams(env.search).get(WEBGPU_OVERRIDE);
  if (query !== null) return query;
  try {
    return env.store?.getItem(`stayput-${WEBGPU_OVERRIDE}`) ?? null;
  } catch {
    return null;
  }
}

/** Whether to try the WebGPU path at all. The worker still probes for a real adapter and device before it loads anything. */
export function wantsWebgpu(env: Env = environment()): boolean {
  const force = forced(env);
  if (!WEBGPU_CAPTIONS || force === '0') return false;
  if (!('gpu' in env.nav) || !env.nav.gpu) return false;
  const optedIn = force === '1';
  if (isPhoneBrowser(env.nav) && !WEBGPU_CAPTIONS_ON_PHONES && !optedIn) return false;
  if (typeof env.nav.deviceMemory === 'number' && env.nav.deviceMemory < WEBGPU_MIN_DEVICE_MEMORY_GB) return false;
  // Opting in tries again even where it failed in the last week.
  if (optedIn) return true;
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
