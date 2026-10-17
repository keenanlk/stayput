import { bool, createShell, radio, str, type Progress, type ShellFile } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { captionAt, fitCaptions, parseSubtitles, toSrt, type Segment } from '../lib/captions';
import { captionFont, drawCaption, type Look, type Place, type Size } from '../lib/burn';
import { CaptionsUnavailable, ensureH264Encoder, hasVideoEncoder } from '../lib/encoder-probe';
import { EncoderStall } from '../lib/encoder-watchdog';
import { encodeFailedError, encodeMemoryError, looksLikeMemory, noSpeechFound, phoneSpeechMemoryError, plainCaptionError, SpeechError, unknownCaptionError } from '../lib/speech-errors';
import { describeEdit } from './video-edit-shell';
import { MODEL_DOWNLOAD_NOTE, overPhoneLimit, phoneLimitNote, TRIM_LINK } from '../lib/phone-limit';
import { InputError } from '../lib/input-error';
import { pageHiddenDuringRun } from '../lib/wake-lock';
import { pageRecoveryHooks } from '../lib/recovery-hooks';
import { withRecovery } from '../lib/edit-recovery';
import { isNotReadable, notReadable, probeReadable, retryUnreadable } from '../lib/read-failure';

/**
 * Add subtitles to a video, burned into the picture. The captions come from
 * an SRT or VTT file dropped with the video, or are written from the speech
 * by Whisper on the device (src/lib/speech.ts). Each frame is then drawn on a
 * canvas with its caption and encoded again (src/lib/video-edit.ts). Nothing
 * leaves the tab.
 */

const isSubs = (f: File) => /\.(srt|vtt)$/i.test(f.name);

function srtOutput(file: File, segments: Segment[]): OutputFile {
  const body = toSrt(segments);
  return { name: suffixName(file.name, '', 'srt'), blob: new Blob([body], { type: 'application/x-subrip;charset=utf-8' }), note: `${segments.length} caption${segments.length === 1 ? '' : 's'}`, text: body };
}

/** Set once the speech model is loaded: stops its worker and gives back the ~0.7 GB it holds. */
let releaseSpeechModel: (() => void) | undefined;
let running = false;
/** A run ran out of memory. A phone's browser may not give all of it back, so the page says to reload before the next try. */
let reloadAdvised = false;
const RELOAD_NOTE = 'The last run ran out of memory. Reload the page before captioning another video.';

const shell = createShell({
  keepAwake: true,
  announceStart: true,
  // A video too big for a phone to caption is said so now, not after the browser gives up.
  onFilesChanged(files) {
    // Clear: nothing is held for the next run. The worker restarts from the stored model, with no new download.
    if (files.length === 0 && !running) releaseSpeechModel?.();
    const videos = files.filter((f) => !isSubs(f.file));
    const speech = !files.some((f) => isSubs(f.file));
    const note = speech ? phoneLimitNote(Math.max(0, ...videos.map((f) => f.file.size))) : '';
    shell.setHint([reloadAdvised ? RELOAD_NOTE : '', note, speech ? MODEL_DOWNLOAD_NOTE : ''].filter(Boolean).join(' '), TRIM_LINK);
  },
  outputFormat: () => 'mp4',
  async process(files, progress) {
    running = true;
    try {
      return await run(files, progress);
    } catch (e) {
      // A run that failed after the page was hidden says so (see the shell), not that it ran out of memory.
      if ((e as { memory?: boolean } | null)?.memory && !pageHiddenDuringRun()) {
        reloadAdvised = true;
        shell.setHint(RELOAD_NOTE);
      }
      throw e;
    } finally {
      // Every way out, success or not: the model's worker does not outlive the run.
      running = false;
      releaseSpeechModel?.();
    }
  },
});
// Before any file is added, the hint above Run already says what the first run downloads.
shell.setHint(MODEL_DOWNLOAD_NOTE);

/** An error the page will show as "out of memory", marked so the page can advise a reload. */
const asMemory = <T extends Error>(e: T): T => Object.assign(e, { memory: true });

async function run(files: ShellFile[], progress: Progress): Promise<OutputFile[]> {
  const subsFiles = files.filter((f) => isSubs(f.file));
  const videos = files.filter((f) => !isSubs(f.file));
  if (videos.length === 0) throw new InputError('Add the video too: the subtitle file only says what to write.');
  if (subsFiles.length > 1) throw new InputError('Add one subtitle file at a time, with the video it belongs to.');
  if (subsFiles.length === 1 && videos.length > 1) throw new InputError('A subtitle file fits one video. Add just that video with it.');
  // A subtitle file the phone cannot read is said so, not reported as one with no captions in it.
  const given = subsFiles[0] ? parseSubtitles(await subsFiles[0].file.text().catch((e) => Promise.reject(isNotReadable(e) ? notReadable(e) : e))) : undefined;
  if (given && given.length === 0) throw new InputError(`No captions could be read from ${subsFiles[0]!.file.name}. It should be an SRT or WebVTT file.`);

  const look = radio('look', 'outline') as Look;
  const size = radio('size', 'medium') as Size;
  const place = radio('place', 'bottom') as Place;
  const language = str('language', 'auto');
  const saveSrt = bool('save-srt');
  const { assertReadable, editVideo } = await import('../lib/video-edit');
  // Find out now, in a second or two, that this browser cannot encode, not after minutes of transcribing.
  progress.set('Checking this browser can write the video…', 0);
  if (!hasVideoEncoder()) throw new CaptionsUnavailable("Burned-in captions don't work in this browser yet, because it has no video encoder. Video to subtitles makes an SRT or WebVTT subtitle file from the same video, and that does work here.");
  if (!(await ensureH264Encoder())) throw new CaptionsUnavailable();
  // A video this browser cannot decode (HEVC on some phones, say) is said so now, not after the speech model's download and minutes of transcribing.
  for (const v of videos) {
    // A video the phone cannot reach is said so now, after one more look, not after the model download.
    await retryUnreadable(v.file, async () => (await probeReadable(v.file), assertReadable(v.file)), (message) => progress.set(`${v.file.name}: ${message}`, 0));
  }
  const outputs: OutputFile[] = [];
  for (const [index, entry] of videos.entries()) {
    const file = entry.file;
    const share = (f: number) => (index + f) / videos.length;
    let segments: Segment[];
    let from = 'from your subtitle file';
    let path = '';
    if (given) segments = given;
    else {
      const speechModule = await import('../lib/speech');
      releaseSpeechModel = speechModule.releaseSpeechModel;
      // Writing the captions is roughly the first 40% of the work, encoding the rest.
      // A phone that was backgrounded while the sound was read or transcribed starts this step again once, when the page is back.
      const page = pageRecoveryHooks((message) => progress.set(`${file.name}: ${message}`, share(0.01)));
      let speech;
      try {
        speech = await withRecovery(
          () =>
            // A file the phone failed to read is read once more, and never reported as a memory or sound problem.
            retryUnreadable(
              file,
              () =>
                speechModule.transcribeFile(file, { language, task: bool('translate') ? 'translate' : 'transcribe', onProgress: (m, f) => progress.set(m, share(f * 0.4)) }).catch((e) => {
                  if (isNotReadable(e)) throw notReadable(e);
                  const plain = plainCaptionError(e);
                  // On a phone with a video this big, an error that names no cause, or a worker that just died, is memory.
                  const unnamed = !(plain instanceof SpeechError) || ['WorkerCrashError', 'SpeechModelError'].includes(plain.name);
                  if (overPhoneLimit(file.size) && unnamed) throw asMemory(phoneSpeechMemoryError(e));
                  throw plain.name === 'OutOfMemoryError' || plain.name === 'WorkerCrashError' ? asMemory(plain) : plain;
                }),
              (message) => progress.set(`${file.name}: ${message}`, share(0.01)),
            ),
          // There is no picture to make smaller in this step.
          () => 0,
          page.hooks,
        );
      } finally {
        page.dispose();
      }
      // The model is no longer needed; free its memory before the video is redrawn.
      speechModule.releaseSpeechModel();
      segments = speech.segments;
      path = speech.pathNote ? ` ${speech.pathNote}` : '';
      if (segments.length === 0) throw noSpeechFound(`No speech was found in ${file.name}, so there are no subtitles to add.`);
      const spoken = new Intl.DisplayNames(['en'], { type: 'language' }).of(speech.language) ?? speech.language;
      from = bool('translate') ? `translated to English from ${spoken} speech` : `written from ${spoken} speech`;
    }
    const start = given ? 0.01 : 0.4;
    let fitted: Segment[] | undefined;
    let shown = 0;
    let last: Segment | undefined;
    // A redraw that starts again counts the captions from the start.
    const redraw = () => {
      shown = 0;
      last = undefined;
      return editVideo(file, {
      // After the page was hidden, or an encoder that stopped, the redraw starts again by itself: say so.
      onNotice: (message) => {
        shown = 0;
        last = undefined;
        progress.set(`${file.name}: ${message}`, share(start));
      },
      readsBack: false,
      paint(ctx, t) {
        const { width, height } = ctx.canvas;
        const { font, px, maxWidth } = captionFont(width, height, size);
        if (!fitted) {
          ctx.save();
          ctx.font = font;
          fitted = fitCaptions(segments, (s) => ctx.measureText(s).width, maxWidth);
          ctx.restore();
        }
        const cap = captionAt(fitted, t);
        if (!cap) return;
        drawCaption(ctx, cap.text, look, place, px, font);
        if (cap !== last) shown++;
        last = cap;
      },
      onProgress: (f) => progress.set(`Adding subtitles to ${file.name}: ${Math.round(f * 100)}%`, share(start + f * (1 - start))),
      });
    };
    const r = await retryUnreadable(file, redraw, (message) => progress.set(`${file.name}: ${message}`, share(start))).catch((e) => {
      // A stall part way through: the same plain message and link as the early check.
      if (e instanceof EncoderStall) throw new CaptionsUnavailable();
      // A file the phone could not read is not an encoder or memory failure; its name stays NotReadableError.
      if (isNotReadable(e)) {
        const unread = notReadable(e) as Error & { salvage?: OutputFile[] };
        if (!given) unread.salvage = [srtOutput(file, segments)];
        throw unread;
      }
      // Any other failure while redrawing: the captions written from speech already exist, so hand them over with the message.
      // Out of memory, or an unnamed failure on a phone with a video this big (Safari's EncodingError "Unknown error"), says so.
      // A RangeError whose message names no memory (a bad buffer length) is not blamed on the phone's size.
      const memory = looksLikeMemory(e) || (overPhoneLimit(file.size) && !(e instanceof RangeError));
      const err = (memory ? asMemory(encodeMemoryError(e)) : given ? unknownCaptionError(e) : encodeFailedError(e)) as Error & { salvage?: OutputFile[] };
      if (!given) err.salvage = [srtOutput(file, segments)];
      throw err;
    });
    if (shown === 0) throw new InputError(`None of the subtitles fall within ${file.name}. Check that the subtitle file belongs to this video.`);
    outputs.push({
      name: suffixName(file.name, '-subtitled', r.ext),
      blob: r.blob,
      originalSize: file.size,
      note: `${describeEdit(r)}${r.retry === 'resumed' ? ' (started again after the page was hidden)' : r.retry === 'smaller' ? " (made at a smaller size, because the device's video encoder stopped at the full size)" : r.retry === 'again' ? ' (made on a second try, after the device\'s video encoder stopped responding)' : ''}, ${shown} caption${shown === 1 ? '' : 's'} ${from}.${path}`,
    });
    if (saveSrt) outputs.push(srtOutput(file, segments));
  }
  return outputs;
}
