import { parseSubtitles, toSrt, toText, toVtt } from './captions';
import { InputError } from './input-error';

export type SubtitleFormat = 'srt' | 'vtt' | 'txt';
export type SubtitleChoice = SubtitleFormat | 'auto';

/** WebVTT starts with a WEBVTT line (after an optional byte-order mark); anything else is read as SRT. */
export function sniffSubtitles(text: string): 'srt' | 'vtt' {
  return /^﻿?\s*WEBVTT/.test(text) ? 'vtt' : 'srt';
}

/**
 * Rewrite a subtitle file in another format. `auto` turns SRT into WebVTT and WebVTT into SRT.
 * A file with no readable captions is an InputError, not a failure of the tool.
 */
export function convertSubtitles(text: string, choice: SubtitleChoice): { text: string; format: SubtitleFormat; cues: number } {
  const segments = parseSubtitles(text);
  if (segments.length === 0) {
    throw new InputError('No captions with times were found. This does not look like an SRT or WebVTT subtitle file.');
  }
  const format: SubtitleFormat = choice === 'auto' ? (sniffSubtitles(text) === 'vtt' ? 'srt' : 'vtt') : choice;
  const out = format === 'srt' ? toSrt(segments) : format === 'vtt' ? toVtt(segments) : toText(segments);
  return { text: out, format, cues: segments.length };
}
