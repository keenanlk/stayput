/**
 * Screen recording in the page: the browser's own screen picker
 * (getDisplayMedia) and recorder (MediaRecorder). The recording is kept in
 * memory in this tab and never sent anywhere.
 */

/** Recorder formats to try, best first. Chrome 126+ and Safari write MP4; older Chrome and Firefox write WebM. */
const TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function canRecordScreen(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
}

/** The first recorder format this browser supports, and the file extension that goes with it. */
export function pickType(): { mimeType: string; ext: 'mp4' | 'webm' } {
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  return { mimeType, ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

/**
 * One sound track from the screen's sound and the microphone. With both, they
 * are mixed through an AudioContext; with one, its track is used as it is.
 */
export function mixAudio(tracks: MediaStreamTrack[]): { track?: MediaStreamTrack; close: () => void } {
  if (tracks.length === 0) return { close: () => {} };
  if (tracks.length === 1) return { track: tracks[0], close: () => {} };
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  for (const t of tracks) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest);
  return { track: dest.stream.getAudioTracks()[0], close: () => void ctx.close() };
}

/** A name like screen-recording-2026-09-29-1542.webm, in local time. */
export function recordingName(ext: string, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `screen-recording-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.${ext}`;
}

/** m:ss, or h:mm:ss past an hour. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Browser recorders write the file as it goes, so the length is missing from
 * its header and players cannot seek it. Copying the tracks into a fresh file
 * (no re-encoding) writes the length and an index. If that fails, the
 * recording is returned as it was: it still plays.
 */
export async function finishRecording(blob: Blob, ext: 'mp4' | 'webm'): Promise<{ blob: Blob; duration?: number }> {
  // Mediabunny is loaded only once there is a recording to finish.
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const format = ext === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
    const output = new Output({ format, target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, video: {}, audio: {} });
    if (!conversion.isValid) return { blob };
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) return { blob };
    const fixed = new Blob([buffer], { type: format.mimeType });
    const check = new Input({ source: new BlobSource(fixed), formats: ALL_FORMATS });
    try {
      return { blob: fixed, duration: await check.computeDuration() };
    } finally {
      check.dispose?.();
    }
  } catch (e) {
    console.warn('Could not rewrite the recording; keeping it as recorded.', e);
    return { blob };
  } finally {
    input.dispose?.();
  }
}
