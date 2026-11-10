/**
 * When WebCodecs says a video cannot be decoded, the browser may still play it in a <video> element (it has its own decoders:
 * Safari and Chrome on a Mac play HEVC where WebCodecs says no, say). This is the one place that tries that before a tool refuses:
 *
 *   decodeOrElement(track, file) -> null            the WebCodecs decoder can read it: carry on as usual
 *                                -> ElementClip     only the element can: draw its frames (elementFrames) and encode them
 *                                -> throws          neither can: a class named for the cause (UnsupportedHevc, UnsupportedHdr,
 *                                                   UnsupportedAv1, UnsupportedProRes, else UnsupportedCodec)
 *
 * The element path reads frames by seeking, so it is slower than WebCodecs and is only used where WebCodecs refuses.
 * Nothing leaves the tab: the file is played from a local object URL.
 */
import type { InputVideoTrack } from 'mediabunny';
import { BufferTarget, Mp4OutputFormat, Output, VideoSample, VideoSampleSource, AudioSampleSource, getFirstEncodableAudioCodec, QUALITY_HIGH, type Quality, type VideoCodec } from 'mediabunny';
import { DecodeFailed, NamedError, UnsupportedCodec } from './input-error';
import { watchEncode } from './encoder-watchdog';
import { encodeOptions, type Attempt } from './edit-recovery';
import { SAMPLE_RATE, decodePcm, pcmFeeder, stereo } from './pcm';

/** What a refusal says, by device: unchanged wording, now kept here so every refusing tool uses the same. */
export function unplayable(nav: Pick<Navigator, 'userAgent'> | undefined = typeof navigator === 'undefined' ? undefined : navigator): string {
  // "Try Safari" does not help on an Android phone, where the clip is usually HEVC or HDR from the camera.
  if (nav && /Android/i.test(nav.userAgent)) {
    return 'This phone cannot decode this video. Clips recorded as HEVC (H.265) or HDR often cannot be read in the browser here: in the camera settings choose "Most compatible" (H.264) or turn HDR video off, record again, then add the new clip. Nothing was uploaded.';
  }
  return 'This browser cannot decode this video. iPhone videos are often HEVC (H.265), which Chrome and Firefox on Windows or Linux cannot read: try Safari, or set the iPhone camera to "Most Compatible".';
}

/** The classes a refusal can end as, by cause. `UnsupportedCodec` is what is left when the cause is none of the others. */
export type UndecodableClass = 'UnsupportedHevc' | 'UnsupportedHdr' | 'UnsupportedAv1' | 'UnsupportedProRes' | 'UnsupportedCodec';
export const UNDECODABLE_CLASSES: readonly UndecodableClass[] = ['UnsupportedHevc', 'UnsupportedHdr', 'UnsupportedAv1', 'UnsupportedProRes', 'UnsupportedCodec'];

/** ProRes is a QuickTime codec Mediabunny does not name: its sample entry is one of these four-character codes. */
const PRORES = /ap4[hx]|apch|apcn|apcs|apco/;

async function looksLikeProRes(file: Blob): Promise<boolean> {
  try {
    // The sample description sits in the header block or, for a phone or camera file, in the last megabyte.
    const parts = [file.slice(0, 262_144), file.size > 262_144 ? file.slice(Math.max(262_144, file.size - 1_048_576)) : null];
    for (const part of parts) {
      if (!part) continue;
      const text = new TextDecoder('latin1').decode(new Uint8Array(await part.arrayBuffer()));
      if (PRORES.test(text) && /stsd/.test(text)) return true;
    }
  } catch {
    // A read that fails here is the job's own read failure to report, not a reason to change this name.
  }
  return false;
}

/** The pure part: which class a codec, its parameter string and its colour description fall in. */
export function classifyCodec(codec: string | null, params: string | null, hdr: boolean, prores = false): UndecodableClass {
  if (prores && !codec) return 'UnsupportedProRes';
  // HDR first: an HDR HEVC clip is an HDR failure (phone cameras record it by default), and 10-bit in any codec is the same cause.
  const p = (params ?? '').toLowerCase();
  const tenBit =
    /^(hvc1|hev1)\.(2|3|4)\./.test(p) || // HEVC Main 10 and the range extensions
    /^avc[13]\.(6e|7a|f4)/.test(p) || // H.264 High 10, High 4:2:2, High 4:4:4
    /^vp09\.(02|03)\./.test(p) || // VP9 profile 2 and 3
    /^av01\.\d\.\d+[mh]\.(10|12)/.test(p); // AV1 at 10 or 12 bits
  if (hdr || tenBit) return 'UnsupportedHdr';
  if (codec === 'hevc') return 'UnsupportedHevc';
  if (codec === 'av1') return 'UnsupportedAv1';
  return 'UnsupportedCodec';
}

/** The error a tool ends with for a clip nothing here can decode: the cause's class, and the same plain words as before. */
export async function undecodableError(track: InputVideoTrack, file: Blob, prefix = ''): Promise<Error> {
  const codec = await track.getCodec().catch(() => null);
  const params = await track.getCodecParameterString().catch(() => null);
  const hdr = await track.hasHighDynamicRange().catch(() => false);
  const name = classifyCodec(codec, params, hdr, !codec ? await looksLikeProRes(file) : false);
  const e = new UnsupportedCodec(prefix + unplayable());
  e.name = name;
  return e;
}

/** A clip the browser can play in a <video> element, kept open until `dispose`. */
export interface ElementClip {
  video: HTMLVideoElement;
  /** The picture as it is shown (the element applies the phone's rotation itself). */
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  dispose(): void;
}

const LOAD_MS = 8_000;
const SEEK_MS = 8_000;

const once = (el: HTMLVideoElement, ok: string, ms: number): Promise<boolean> =>
  new Promise((done) => {
    const timer = setTimeout(() => finish(false), ms);
    const finish = (v: boolean) => {
      clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener('error', onErr);
      done(v);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    el.addEventListener(ok, onOk);
    el.addEventListener('error', onErr);
  });

/** Opens the file in a <video> element: canPlayType says maybe or probably, and a real frame loads. Null when the browser cannot play it. */
export async function openInElement(file: Blob, mimeHint = ''): Promise<ElementClip | null> {
  if (typeof document === 'undefined') return null;
  const video = document.createElement('video');
  const type = (file.type || mimeHint || '').split(';')[0]!;
  if (type && video.canPlayType(type) === '') return null;
  const url = URL.createObjectURL(file);
  const dispose = () => {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const loaded = once(video, 'loadeddata', LOAD_MS);
  video.src = url;
  if (!(await loaded) || !video.videoWidth || !video.videoHeight || !(video.duration > 0) || !Number.isFinite(video.duration)) {
    dispose();
    return null;
  }
  return { video, width: video.videoWidth, height: video.videoHeight, duration: video.duration, dispose };
}

/**
 * The one check every tool that refuses an undecodable video uses. See the file's head. `file` is the clip's File; `prefix` goes in front
 * of a refusal's message (a merge names the clip).
 */
export async function decodeOrElement(track: InputVideoTrack, file: File, prefix = '', useElement = true): Promise<ElementClip | null> {
  if (await track.canDecode().catch(() => true)) return null;
  const clip = useElement ? await openInElement(file, file.type || mimeOfName(file.name)) : null;
  if (clip) return clip;
  throw await undecodableError(track, file, prefix);
}

const mimeOfName = (name: string): string => {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === 'mov' ? 'video/quicktime' : ext === 'mkv' ? 'video/x-matroska' : ext === 'webm' ? 'video/webm' : ext === 'mp4' || ext === 'm4v' ? 'video/mp4' : '';
};

/** The same refusal for a Conversion that Mediabunny marked 'undecodable_source_codec': the element path was already tried before it ran. */
export const refused = undecodableError;

/** Moves the element to `t` seconds and waits for the frame. A frame that never arrives is a decoder failure (DecodeFailed, final). */
async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(video.currentTime - t) < 1e-3 && video.readyState >= 2) return;
  const seeked = once(video, 'seeked', SEEK_MS);
  video.currentTime = t;
  if (!(await seeked)) throw new DecodeFailed();
}

/**
 * The element's frames at `fps`, one per step: each yield has the element showing that moment, ready to draw with drawImage.
 * The caller draws before asking for the next one.
 */
export async function* elementFrames(clip: ElementClip, fps: number): AsyncGenerator<{ time: number; video: HTMLVideoElement }> {
  const step = 1 / fps;
  const last = Math.max(0, clip.duration - step / 2);
  for (let t = 0; t <= last + 1e-6; t += step) {
    await seekTo(clip.video, Math.min(t, Math.max(0, clip.duration - 0.001)));
    yield { time: t, video: clip.video };
  }
}

/** Draws the element's frame scaled to fit inside the canvas, centred, on black. */
export function drawContain(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const k = Math.min(width / video.videoWidth, height / video.videoHeight);
  const w = video.videoWidth * k;
  const h = video.videoHeight * k;
  ctx.drawImage(video, (width - w) / 2, (height - h) / 2, w, h);
}

/** Frame rate of the element path. A seek per frame is slow, so it stays at the usual 30. */
export const ELEMENT_FPS = 30;

export interface ElementEncode {
  width: number;
  height: number;
  codec: VideoCodec;
  bitrate: number | Quality;
  /** Output size is filled by the picture (resize), or the picture sits inside it on black (compress). */
  fit: 'fill' | 'contain';
  /** A quarter turn or mirror, as in the edit tools. */
  rotate?: number;
  flip?: boolean;
  attempt: Attempt;
  /** The sound is decoded from the file and re-encoded, unless muted. */
  mute: boolean;
  /** The source has a sound track (so one left out is reported as dropped). */
  hasSound: boolean;
  onProgress?: (fraction: number) => void;
  /** Named for the step that failed, so an element-path failure is never a bare error. */
  stage?: string;
}

export interface ElementEncoded {
  buffer: ArrayBuffer;
  audio: boolean;
  audioDropped: boolean;
}

/** Encodes the element's pictures (and the file's sound) into an MP4. This is the fallback body shared by compress and the edit tools. */
export async function encodeFromElement(file: File, clip: ElementClip, o: ElementEncode): Promise<ElementEncoded> {
  const hadSound = !o.mute && o.hasSound;
  let sound: Float32Array[] | null = null;
  if (!o.mute && o.hasSound) {
    try {
      sound = await decodePcm(file);
    } catch (e) {
      if ((e as { name?: string })?.name === 'UnreadableFileGone' || (e as { name?: string })?.name?.startsWith('NotReadable')) throw e;
      sound = null;
    }
    if (sound) sound = stereo(sound);
  }
  const audioCodec = sound ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH }) : null;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const videoSource = new VideoSampleSource({ codec: o.codec, bitrate: o.bitrate, ...encodeOptions(o.attempt) });
  output.addVideoTrack(videoSource, { frameRate: ELEMENT_FPS });
  const audioSource = audioCodec && sound ? new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();
  const feed = pcmFeeder(audioSource, audioSource ? sound : null);
  const canvas = new OffscreenCanvas(o.width, o.height);
  const ctx = canvas.getContext('2d')!;
  const quarter = o.rotate === 90 || o.rotate === 270;
  await watchEncode(
    async (progress) => {
      let at = 0;
      const total = Math.max(0.001, clip.duration);
      for await (const f of elementFrames(clip, ELEMENT_FPS)) {
        if (o.fit === 'contain' && !o.rotate && !o.flip) {
          drawContain(ctx, f.video, o.width, o.height);
        } else {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, o.width, o.height);
          ctx.translate(o.width / 2, o.height / 2);
          if (o.flip) ctx.scale(-1, 1);
          if (o.rotate) ctx.rotate((o.rotate * Math.PI) / 180);
          const w = quarter ? o.height : o.width;
          const h = quarter ? o.width : o.height;
          ctx.drawImage(f.video, -w / 2, -h / 2, w, h);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        const frame = new VideoSample(canvas, { timestamp: f.time, duration: Math.max(1 / ELEMENT_FPS, Math.min(1 / ELEMENT_FPS, total - f.time)) });
        await feed.until(f.time);
        await videoSource.add(frame);
        frame.close();
        at = f.time;
        const share = Math.min(0.99, at / total);
        progress(share);
        o.onProgress?.(share);
      }
      await feed.until(Infinity);
      videoSource.close();
      audioSource?.close();
      await output.finalize();
    },
    () => output.cancel(),
  );
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new NamedError(o.stage ?? 'ElementEncodeFailed', 'The video could not be written.');
  o.onProgress?.(1);
  return { buffer, audio: !!audioSource, audioDropped: hadSound && !audioSource };
}
