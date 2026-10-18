/**
 * Two guards for the browser's own sound decoder, which on some engines (Safari's, on Linux especially) waits
 * forever on a file it cannot finish reading instead of refusing it. Neither needs a codec, so a spec can drive
 * them directly.
 */
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { audioDecodeError } from './speech-errors';
import { isNotReadable } from './read-failure';

/** Containers whose index sits in the file's head or tail: if the demuxer finds no sound in one, a decoder will not either. */
const INDEXED = new Set(['MP4', 'QuickTime File Format', 'WebM', 'Matroska']);

export const CUT_SHORT = 'This file looks cut short, or is missing its index, so no sound can be read from it. Record or export it again, or try another copy.';

/**
 * Throws AudioDecodeError for a video container whose sound the demuxer cannot find, before the browser's decoder
 * is given the bytes. A file the demuxer cannot place at all is left to the decoder, as before.
 */
export async function refuseSoundlessContainer(file: Blob): Promise<void> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const format = await input.getFormat().catch(() => null);
    if (!format || !INDEXED.has(format.name)) return;
    const tracks = await input.getTracks();
    if (tracks.length === 0) throw audioDecodeError(CUT_SHORT);
    if (!tracks.some((t) => t.isAudioTrack())) throw audioDecodeError();
  } catch (e) {
    if (isNotReadable(e) || (e instanceof Error && e.name === 'AudioDecodeError')) throw e;
  } finally {
    input.dispose?.();
  }
}

/** Seconds a decode may take: generous for a long recording, but finite. */
export function decodeBudgetMs(bytes: number): number {
  return Math.max(30_000, (bytes / 1e6) * 2_000);
}

/** `decodeAudioData`, but a decode that never answers ends as a DecodeTimeout (an AudioDecodeError by kind), not a page that waits forever. */
export function decodeWithin(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  const budget = decodeBudgetMs(bytes.byteLength);
  return new Promise<AudioBuffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      const cause = new Error(`the browser's sound decoder gave no answer in ${Math.round(budget / 1000)} s`);
      cause.name = 'DecodeTimeout';
      reject(audioDecodeError('The browser could not finish reading the sound of this file, which usually means the file is damaged or cut short. Try another copy of it.', cause));
    }, budget);
    ctx.decodeAudioData(bytes).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
