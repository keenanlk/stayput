/** Pure parts of the tone generator: the frequency scale, the level curve and the lists. */

export const MIN_HZ = 20;
export const MAX_HZ = 20000;
export const DEFAULT_HZ = 440;

export const WAVES = [
  { type: 'sine', label: 'Sine' },
  { type: 'square', label: 'Square' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'sawtooth', label: 'Sawtooth' },
] as const;
export type Wave = (typeof WAVES)[number]['type'];

export const PRESETS = [
  { hz: 440, label: '440 Hz (A4)' },
  { hz: 1000, label: '1 kHz' },
  { hz: 50, label: '50 Hz (test bass)' },
] as const;

/** Level slider, in percent of full scale. The device volume is separate. */
export const DEFAULT_LEVEL = 10;
export const MAX_LEVEL = 50;
export const levelToGain = (percent: number): number => Math.max(0, Math.min(MAX_LEVEL, percent)) / 100;

/** The slider runs 0 to 1000 and maps to 20 Hz to 20 kHz on a log scale. */
export const SLIDER_MAX = 1000;
export const clampHz = (hz: number): number => (Number.isFinite(hz) ? Math.max(MIN_HZ, Math.min(MAX_HZ, hz)) : DEFAULT_HZ);
export function sliderToHz(position: number): number {
  const x = Math.max(0, Math.min(SLIDER_MAX, position)) / SLIDER_MAX;
  return Math.round(MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, x) * 10) / 10;
}
export function hzToSlider(hz: number): number {
  return Math.round((Math.log(clampHz(hz) / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * SLIDER_MAX);
}
export function formatHz(hz: number): string {
  return hz >= 1000 ? `${Number((hz / 1000).toFixed(2))} kHz` : `${Number(hz.toFixed(1))} Hz`;
}
