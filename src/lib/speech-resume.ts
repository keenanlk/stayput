import { clean, type Segment } from './captions';
import { NamedError } from './input-error';
import { restartsOnce } from './speech-errors';
import type { SpeechModel } from './speech-path';

/**
 * The piece-by-piece part of a speech run, with the worker, the page and the clock passed in so it can be tested
 * without a browser. Pieces already recognised are kept: a worker that dies, or a page that is hidden, after the first
 * piece costs one piece, not the whole run.
 */

/** How many times one run picks up again after its first piece. */
export const MAX_RESUMES = 2;

export interface PieceDeps {
  /** One piece of sound through a worker. */
  recognise(piece: Float32Array, language: string | null, model: SpeechModel, onLoading: (fraction: number) => void): Promise<{ chunks: Segment[]; language: string }>;
  /** Stop the live worker. */
  release(): void;
  /** Wait this long (a stopped worker gives its memory back a moment later). */
  pause(ms: number): Promise<void>;
  /** The page's own hooks: hidden since the run started, back in view, and forget the hidden mark once it is handled. */
  page: { wasHidden(): boolean; whenVisible(): Promise<void>; forgetHidden(): void };
  /** A memory death with the model in use: true when the retry should use the smaller one (and the tab remembers it). */
  stepDown(err: Error, model: SpeechModel): boolean;
  /** Seconds as m:ss. */
  time(seconds: number): string;
  onProgress(message: string, fraction: number): void;
  /** The model download line, for the model being asked for. */
  onLoading(model: SpeechModel, fraction: number): void;
  /** A piece came back. */
  onPiece(): void;
  /** A worker was dropped to pick up again: the next one starts its model from the store. */
  onResume(): void;
}

export interface PieceRun {
  segments: Segment[];
  language: string | null;
  model: SpeechModel;
  steppedDown: boolean;
}

/** A failure after the first piece that a fresh worker, once the page is back, may get past. */
function resumable(err: Error, page: PieceDeps['page']): boolean {
  return page.wasHidden() || restartsOnce(err) || err.name === 'SpeechModelError';
}

export async function recognisePieces(
  samples: Float32Array,
  cuts: number[],
  rate: number,
  fileName: string,
  opts: { language: string | null; task: string; model: SpeechModel },
  deps: PieceDeps,
): Promise<PieceRun> {
  const total = samples.length / rate;
  const segments: Segment[] = [];
  // Detected once, from the first piece, then kept for the rest of the recording.
  let spoken = opts.language;
  let model = opts.model;
  let steppedDown = false;
  let retriedModel = false;
  let recognised = 0;
  let resumes = 0;
  let sinceResume = 0;
  let covered = 0;
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1]!;
    const at = from / rate;
    deps.onProgress(`Transcribing ${fileName}: ${deps.time(at)} of ${deps.time(total)}`, 0.05 + 0.95 * (at / total));
    const piece = samples.slice(from, cuts[i]);
    let found;
    // The first try hands over a copy, because the sound is handed over to the worker; a later try uses the piece itself.
    let again = false;
    for (;;) {
      try {
        found = await deps.recognise(again ? piece : piece.slice(), spoken, model, (f) => deps.onLoading(model, f));
        break;
      } catch (err) {
        const e = err instanceof Error ? err : new NamedError('SpeechModelError', String(err));
        const down = deps.stepDown(e, model);
        if (recognised === 0) {
          // Before any piece has been recognised, a model that would not start (a kept copy the worker dropped, or a start-up
          // that ran out of memory or killed the worker) gets one more try in a fresh worker: a download again, or the model
          // from the store. The page being hidden counts too: it is waited out first.
          if (retriedModel || !(err instanceof Error) || !(restartsOnce(err) || deps.page.wasHidden())) throw partial(e, segments, spoken, covered, total);
          retriedModel = true;
        } else {
          // Once a piece of this run has been done, a recording that kills the worker again on the very next piece fails fast.
          if (resumes >= MAX_RESUMES || sinceResume === 0 || !resumable(e, deps.page)) throw partial(e, segments, spoken, covered, total);
          resumes++;
          sinceResume = 0;
          deps.onResume();
        }
        // The second try is the only one left, so it is the one that is least likely to die the same way.
        if (down) {
          model = 'whisper-tiny';
          steppedDown = true;
        }
        deps.release();
        await deps.page.whenVisible();
        deps.page.forgetHidden();
        await deps.pause(1000);
        if (recognised > 0) deps.onProgress(`Picking up again from ${deps.time(at)}`, 0.05 + 0.95 * (at / total));
        again = true;
      }
    }
    deps.onPiece();
    recognised++;
    sinceResume++;
    covered = (cuts[i] ?? samples.length) / rate;
    spoken = found.language;
    segments.push(...found.chunks.map((s) => ({ start: s.start + at, end: s.end + at, text: s.text })));
  }
  return { segments: clean(segments), language: spoken, model, steppedDown };
}

/** The error to throw, with what was recognised so far attached. */
function partial(e: Error, segments: Segment[], language: string | null, upTo: number, total: number): Error {
  if (segments.length === 0) return e;
  return Object.assign(e, { partial: { segments: clean(segments), language, upTo, total } satisfies SpeechPartial });
}

export interface SpeechPartial {
  segments: Segment[];
  language: string | null;
  upTo: number;
  total: number;
}
