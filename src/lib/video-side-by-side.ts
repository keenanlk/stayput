/**
 * Put two videos next to each other (or one above the other) in one frame, in the
 * browser. Both clips are decoded by Mediabunny (MPL-2.0) and the browser's WebCodecs
 * decoder; for every frame of the output, the picture of each clip at that moment is
 * drawn into its cell and the whole is encoded once into an MP4. Clips with different
 * frame rates are sampled at the output's rate, so they stay in step. Nothing leaves the tab.
 */
import {
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WEBM,
  getFirstEncodableAudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { watchEncode } from './encoder-watchdog';
import { pickVideoCodec } from './video-codec';
import { SAMPLE_RATE, decodePcm, pcmFeeder, stereo } from './pcm';
import { firstEncodableSound, noAudioEncoder } from './mp3-fallback';
import { InputError } from './input-error';
import { copyClipSound, pictureLength } from './video-merge';
import { estimateMemory, memoryVerdict, outputFps, outputSeconds, planSideBySide, type Plan, type SbsFit, type SbsLayout, type SbsLength, type SbsSound } from './side-by-side-plan';

export interface SideBySideOptions {
  layout: SbsLayout;
  fit: SbsFit;
  sound: SbsSound;
  length: SbsLength;
  /** Whether this is a phone or tablet, for the memory guard. */
  phone?: boolean;
  onProgress?: (fraction: number) => void;
}

export interface SideBySideResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  fps: number;
  videoCodec: string;
  audio: boolean;
  /** Set when sound was asked for but the chosen clip has none, or this browser could not encode it. */
  audioNote: string;
}

interface Clip {
  file: File;
  input: Input;
  track: InputVideoTrack;
  first: number;
  length: number;
  rate: number;
  width: number;
  height: number;
}

const mb = (n: number) => `${Math.round(n / 1e6).toLocaleString('en-US')} MB`;

async function openClip(file: File): Promise<Clip> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  const track = await input.getPrimaryVideoTrack().catch(() => null);
  if (!track) throw new InputError(`${file.name} has no video this page can read (MP4, MOV, WebM or MKV).`);
  if (!(await track.canDecode())) throw new Error(`${file.name}: ${unplayable()}`);
  const { first, length } = await pictureLength(track);
  if (length <= 0) throw new InputError(`${file.name} has no picture to show.`);
  const stats = await track.computePacketStats(120).catch(() => null);
  return { file, input, track, first, length, rate: stats?.averagePacketRate ?? 30, width: track.displayWidth, height: track.displayHeight };
}

/** Draw a sample into its cell of the output, letterboxed or cropped to fill. */
function drawCell(ctx: OffscreenCanvasRenderingContext2D, scratch: OffscreenCanvas, sample: VideoSample, cell: Plan['a'], fit: SbsFit) {
  const s = scratch.getContext('2d')!;
  s.fillStyle = '#000';
  s.fillRect(0, 0, cell.w, cell.h);
  sample.drawWithFit(s, { fit });
  ctx.drawImage(scratch, cell.x, cell.y);
}

/** What a memory estimate would be for these two clips and options, without encoding anything. */
export async function sideBySideEstimate(files: File[], o: Omit<SideBySideOptions, 'onProgress'>) {
  const [a, b] = await Promise.all(files.slice(0, 2).map(openClip));
  try {
    const plan = planSideBySide(a!.width, a!.height, b!.width, b!.height, o.layout, o.fit);
    const fps = outputFps(a!.rate, b!.rate);
    const seconds = outputSeconds(a!.length, b!.length, o.length);
    const bytes = estimateMemory({ ...plan, fps, seconds, sound: o.sound, soundSeconds: Math.max(a!.length, b!.length) });
    return { ...plan, fps, seconds, bytes, refusal: memoryVerdict(bytes, !!o.phone, mb) };
  } finally {
    a!.input.dispose?.();
    b!.input.dispose?.();
  }
}

export async function sideBySide(files: File[], opts: SideBySideOptions): Promise<SideBySideResult> {
  if (files.length < 2) throw new InputError('Add two videos: A and B.');
  const clips: Clip[] = [];
  try {
    for (const f of files.slice(0, 2)) clips.push(await openClip(f));
    const [a, b] = clips as [Clip, Clip];
    const plan = planSideBySide(a.width, a.height, b.width, b.height, opts.layout, opts.fit);
    const fps = outputFps(a.rate, b.rate);
    const seconds = outputSeconds(a.length, b.length, opts.length);
    const refusal = memoryVerdict(
      estimateMemory({ ...plan, fps, seconds, sound: opts.sound, soundSeconds: Math.max(a.length, b.length) }),
      !!opts.phone,
      mb,
    );
    if (refusal) throw new InputError(refusal);

    const videoCodec = await pickVideoCodec({ width: plan.width, height: plan.height, bitrate: QUALITY_HIGH });
    if (!videoCodec) throw new Error('This browser cannot encode video at this size. Try a recent version of Chrome, Edge or Safari.');

    // Sound: A's, B's, or both mixed, cut or padded with silence to the output's length.
    let audioNote = '';
    const source = opts.sound === 'b' ? [b] : opts.sound === 'a' ? [a] : opts.sound === 'mix' ? [a, b] : [];
    const withTrack: { clip: Clip; track: InputAudioTrack }[] = [];
    for (const clip of source) {
      const track = await clip.input.getPrimaryAudioTrack().catch(() => null);
      if (track) withTrack.push({ clip, track });
    }
    if (opts.sound !== 'none' && withTrack.length === 0) audioNote = 'sound left out: the clip has none';

    // Where the browser cannot encode sound (iPhone Safari) but the one clip's sound is AAC, its packets are copied.
    let copyFrom: { clip: Clip; track: InputAudioTrack } | null = null;
    let pcm: Float32Array[] | null = null;
    let audioCodec: Awaited<ReturnType<typeof firstEncodableSound>> = null;
    if (withTrack.length) {
      const canEncode = !!(await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH }));
      if (!canEncode && withTrack.length === 1 && withTrack[0]!.track.codec === 'aac') {
        copyFrom = withTrack[0]!;
      } else {
        const len = Math.round(seconds * SAMPLE_RATE);
        const parts: Float32Array[][] = [];
        for (const { clip } of withTrack) {
          const decoded = await decodePcm(clip.file);
          if (decoded) parts.push(stereo(decoded));
        }
        if (parts.length) {
          pcm = [new Float32Array(len), new Float32Array(len)];
          for (const part of parts) for (let c = 0; c < 2; c++) {
            const src = part[c]!;
            const n = Math.min(len, src.length);
            for (let i = 0; i < n; i++) pcm[c]![i]! += src[i]!;
          }
          let peak = 0;
          for (const ch of pcm) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(ch[i]!));
          if (peak > 1) for (const ch of pcm) for (let i = 0; i < len; i++) ch[i]! /= peak;
        } else {
          audioNote = 'sound left out: this browser cannot read it';
        }
        if (pcm) {
          audioCodec = await firstEncodableSound(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH });
          if (!audioCodec) throw noAudioEncoder(true);
        }
      }
    }

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH });
    output.addVideoTrack(videoSource, { frameRate: fps });
    const audioSource = audioCodec ? new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    const packetSource = copyFrom ? new EncodedAudioPacketSource('aac') : null;
    if (packetSource) output.addAudioTrack(packetSource);
    await output.start();
    const feed = pcmFeeder(audioSource, audioSource ? pcm : null);

    const frames = Math.max(1, Math.round(seconds * fps));
    // Frame k shows each clip's picture at k / fps; a clip that has ended holds its last frame.
    const times = (clip: Clip) =>
      (async function* () {
        for (let k = 0; k < frames; k++) yield clip.first + Math.min(k / fps, Math.max(0, clip.length - 0.5 / fps));
      })();

    await watchEncode(
      async (progress) => {
        const report = (f: number) => {
          progress(f);
          opts.onProgress?.(f);
        };
        const canvas = new OffscreenCanvas(plan.width, plan.height);
        const ctx = canvas.getContext('2d')!;
        const scratchA = new OffscreenCanvas(plan.a.w, plan.a.h);
        const scratchB = new OffscreenCanvas(plan.b.w, plan.b.h);
        const itA = new VideoSampleSink(a.track).samplesAtTimestamps(times(a));
        const itB = new VideoSampleSink(b.track).samplesAtTimestamps(times(b));
        let lastA: VideoSample | null = null;
        let lastB: VideoSample | null = null;
        for (let k = 0; k < frames; k++) {
          const [ra, rb] = await Promise.all([itA.next(), itB.next()]);
          const sa: VideoSample | null = ra.value ?? lastA;
          const sb: VideoSample | null = rb.value ?? lastB;
          if (lastA && lastA !== sa) lastA.close();
          if (lastB && lastB !== sb) lastB.close();
          lastA = sa;
          lastB = sb;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, plan.width, plan.height);
          if (sa) drawCell(ctx, scratchA, sa, plan.a, opts.fit);
          if (sb) drawCell(ctx, scratchB, sb, plan.b, opts.fit);
          const t = k / fps;
          const frame = new VideoSample(canvas, { timestamp: t, duration: 1 / fps });
          await feed.until(t);
          await videoSource.add(frame);
          frame.close();
          report(Math.min(0.99, (k + 1) / frames));
        }
        lastA?.close();
        lastB?.close();
        if (packetSource && copyFrom) {
          await copyClipSound(packetSource, copyFrom.track, { first: copyFrom.clip.first, length: Math.min(copyFrom.clip.length, seconds) }, 0);
        }
        await feed.until(Infinity);
        videoSource.close();
        audioSource?.close();
        packetSource?.close();
        await output.finalize();
      },
      () => output.cancel(),
    );
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    opts.onProgress?.(1);
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width: plan.width,
      height: plan.height,
      duration: frames / fps,
      fps,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioSource || !!packetSource,
      audioNote,
    };
  } finally {
    for (const c of clips) c.input.dispose?.();
  }
}
