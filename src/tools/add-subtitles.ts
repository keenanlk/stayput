import { bool, createShell, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { captionAt, fitCaptions, parseSubtitles, toSrt, type Segment } from '../lib/captions';
import { captionFont, drawCaption, type Look, type Place, type Size } from '../lib/burn';
import { CaptionsUnavailable, ensureH264Encoder } from '../lib/encoder-probe';
import { EncoderStall } from '../lib/encoder-watchdog';
import { encodeMemoryError, looksLikeMemory, noSpeechFound, plainCaptionError, unknownCaptionError } from '../lib/speech-errors';
import { describeEdit } from './video-edit-shell';
import { phoneLimitNote } from '../lib/phone-limit';

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

const shell = createShell({
  // A video too big for a phone to caption is said so now, not after the browser gives up.
  onFilesChanged(files) {
    const videos = files.filter((f) => !isSubs(f.file));
    const speech = !files.some((f) => isSubs(f.file));
    shell.setHint(speech ? phoneLimitNote(Math.max(0, ...videos.map((f) => f.file.size))) : '');
  },
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const subsFiles = files.filter((f) => isSubs(f.file));
    const videos = files.filter((f) => !isSubs(f.file));
    if (videos.length === 0) throw new Error('Add the video too: the subtitle file only says what to write.');
    if (subsFiles.length > 1) throw new Error('Add one subtitle file at a time, with the video it belongs to.');
    if (subsFiles.length === 1 && videos.length > 1) throw new Error('A subtitle file fits one video. Add just that video with it.');
    const given = subsFiles[0] ? parseSubtitles(await subsFiles[0].file.text()) : undefined;
    if (given && given.length === 0) throw new Error(`No captions could be read from ${subsFiles[0]!.file.name}. It should be an SRT or WebVTT file.`);

    const look = radio('look', 'outline') as Look;
    const size = radio('size', 'medium') as Size;
    const place = radio('place', 'bottom') as Place;
    const language = str('language', 'auto');
    const saveSrt = bool('save-srt');
    const { editVideo } = await import('../lib/video-edit');
    // Find out now, in a second or two, that this browser cannot encode, not after minutes of transcribing.
    progress.set('Checking this browser can write the video…', 0);
    if (!(await ensureH264Encoder())) throw new CaptionsUnavailable();
    const outputs: OutputFile[] = [];
    for (const [index, entry] of videos.entries()) {
      const file = entry.file;
      const share = (f: number) => (index + f) / videos.length;
      let segments: Segment[];
      let from = 'from your subtitle file';
      if (given) segments = given;
      else {
        const { transcribeFile, releaseSpeechModel } = await import('../lib/speech');
        // Writing the captions is roughly the first 40% of the work, encoding the rest.
        const speech = await transcribeFile(file, { language, task: bool('translate') ? 'translate' : 'transcribe', onProgress: (m, f) => progress.set(m, share(f * 0.4)) }).catch((e) => {
          throw plainCaptionError(e);
        });
        // The model is no longer needed; free its memory before the video is redrawn.
        releaseSpeechModel();
        segments = speech.segments;
        if (segments.length === 0) throw noSpeechFound(`No speech was found in ${file.name}, so there are no subtitles to add.`);
        const spoken = new Intl.DisplayNames(['en'], { type: 'language' }).of(speech.language) ?? speech.language;
        from = bool('translate') ? `translated to English from ${spoken} speech` : `written from ${spoken} speech`;
      }
      const start = given ? 0.01 : 0.4;
      let fitted: Segment[] | undefined;
      let shown = 0;
      let last: Segment | undefined;
      const r = await editVideo(file, {
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
      }).catch((e) => {
        // A stall part way through: the same plain message and link as the early check.
        if (e instanceof EncoderStall) throw new CaptionsUnavailable();
        // Out of memory while redrawing: the captions already exist, so hand them over with the message.
        if (looksLikeMemory(e)) {
          const err = encodeMemoryError() as Error & { salvage?: OutputFile[] };
          if (!given) err.salvage = [srtOutput(file, segments)];
          throw err;
        }
        throw unknownCaptionError(e);
      });
      if (shown === 0) throw new Error(`None of the subtitles fall within ${file.name}. Check that the subtitle file belongs to this video.`);
      outputs.push({
        name: suffixName(file.name, '-subtitled', r.ext),
        blob: r.blob,
        originalSize: file.size,
        note: `${describeEdit(r)}, ${shown} caption${shown === 1 ? '' : 's'} ${from}`,
      });
      if (saveSrt) outputs.push(srtOutput(file, segments));
    }
    return outputs;
  },
});
