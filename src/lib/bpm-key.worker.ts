/**
 * Finds the tempo and key of a song off the main thread. It receives one mono
 * array of samples at 44,100 Hz (transferred, so the page no longer has it) and
 * returns two small result objects; it never sees the file or its name.
 */
import { analyse, type KeyResult, type TempoResult } from './bpm-key';

export type Request = { id: number; mono: Float32Array };
export type Reply = { id: number; tempo: TempoResult | null; key: KeyResult | null } | { id: number; error: string };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, mono } = event.data;
  try {
    const { tempo, key } = analyse(mono);
    (self as unknown as Worker).postMessage({ id, tempo, key } satisfies Reply);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies Reply);
  }
};
