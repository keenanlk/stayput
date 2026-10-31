/**
 * A warning, before Run, for a recording an hour or longer on a phone: decoded, it is about 1.4 GB of numbers per hour of
 * stereo at 48 kHz, which a phone's tab may not hold. It is a hint only (the run is still allowed) and nothing is recorded
 * about it. The length is the sound track's, from the file's own header where it has one.
 */
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { isPhoneBrowser } from './phone-limit';

/** A recording this long, in seconds, gets the hint on a phone. */
export const LONG_SECONDS = 60 * 60;

export const LONG_HINT = 'This recording looks to be an hour or longer and may be too big for this phone. If it fails, split it into shorter parts with the Audio splitter first.';
export const LONG_HINT_SPLITTER = 'This recording looks to be an hour or longer and may be too big for this phone. If it fails, try it on a computer.';
export const SPLITTER_LINK = { text: 'Audio splitter', href: '/tools/audio-splitter' };

/** Longest wait for a length that has to be found by reading through the file. */
const LOOK_MS = 4000;

/** The sound track's length in seconds, or 0 when it cannot be told. A header's figure is used when there is one. */
export async function audioSeconds(file: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const look = (async () => {
      const track = await input.getPrimaryAudioTrack();
      if (!track) return 0;
      const quick = await track.getDurationFromMetadata().catch(() => null);
      return quick ?? (await track.computeDuration());
    })();
    const seconds = await Promise.race([look, new Promise<number>((r) => setTimeout(() => r(0), LOOK_MS))]);
    return Number.isFinite(seconds) ? seconds : 0;
  } catch {
    return 0;
  } finally {
    input.dispose?.();
  }
}

/**
 * Says so above Run when the first of `files` runs an hour or longer, on a phone. Call from the tool's onFilesChanged; a later
 * call replaces the answer of an earlier one still looking, and a list with no long file clears the hint.
 */
export function longRecordingHint(shell: { setHint: (text?: string, link?: { text: string; href: string }) => void }, opts: { splitter?: boolean } = {}) {
  let latest = 0;
  let shown = false;
  return async (files: { file: Blob }[]): Promise<void> => {
    const turn = ++latest;
    if (!isPhoneBrowser()) return;
    const seconds = files.length ? Math.max(...(await Promise.all(files.map((f) => audioSeconds(f.file))))) : 0;
    if (turn !== latest) return;
    if (seconds < LONG_SECONDS) {
      // Only the hint this set is taken down: another line above Run (a reason Run is blocked) is not its to clear.
      if (shown) shell.setHint('');
      shown = false;
      return;
    }
    shown = true;
    if (opts.splitter) shell.setHint(LONG_HINT_SPLITTER);
    else shell.setHint(LONG_HINT, SPLITTER_LINK);
  };
}
