/** Pure parts of the speaker test: the lists, the level curve and the sweep's frequency at a moment. */

export const FREQUENCIES = [
  { hz: 100, label: '100 Hz (low)' },
  { hz: 440, label: '440 Hz (concert A)' },
  { hz: 1000, label: '1 kHz (middle)' },
  { hz: 4000, label: '4 kHz (high)' },
  { hz: 10000, label: '10 kHz (very high)' },
] as const;
export const DEFAULT_FREQUENCY = 440;

/** The sweep rises from 50 Hz to 16 kHz, in equal musical steps, over 20 seconds. Never into ultrasound. */
export const SWEEP_FROM = 50;
export const SWEEP_TO = 16000;
export const SWEEP_SECONDS = 20;

/** Level slider, in percent of the page's own signal. The device volume is separate. */
export const DEFAULT_LEVEL = 10;
export const CONFIRM_ABOVE = 50;
export const MAX_LEVEL = 70;

/** Tones and noise stop on their own after this long. */
export const AUTO_STOP_SECONDS = 60;

export type Channel = 'left' | 'right' | 'both';

/** The gain each side gets for a channel choice: a side that is not chosen is exactly silent. */
export function channelGains(channel: Channel): { left: number; right: number } {
  return { left: channel === 'right' ? 0 : 1, right: channel === 'left' ? 0 : 1 };
}

export const levelToGain = (percent: number): number => Math.max(0, Math.min(MAX_LEVEL, percent)) / 100;

/** The sweep's frequency `t` seconds in (logarithmic), held at the end once it is over. */
export function sweepFrequency(t: number): number {
  const x = Math.max(0, Math.min(1, t / SWEEP_SECONDS));
  return SWEEP_FROM * Math.pow(SWEEP_TO / SWEEP_FROM, x);
}

export function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toLocaleString('en', { maximumFractionDigits: 2 })} kHz` : `${Math.round(hz)} Hz`;
}

/** Pink noise (Paul Kellet's filter on white noise), scaled so its peak is 0.5. */
export function pinkNoise(length: number, random: () => number = Math.random): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const w = random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const k = peak > 0 ? 0.5 / peak : 0;
  for (let i = 0; i < length; i++) out[i]! *= k;
  return out;
}
