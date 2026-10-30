/**
 * Which video codec the browser should write. H.264 plays everywhere (iPhone
 * Photos, WhatsApp, PowerPoint, every TV), so it is always tried first; VP9 and
 * AV1 are the fallback where a browser has no H.264 encoder (some Linux builds).
 */
import { encodesAtSize, requireH264Encoder, sameSizeRung } from './encoder-probe';
import { smallerSide, type Attempt, type ProbePlan } from './edit-recovery';
import { getFirstEncodableVideoCodec, type InputAudioTrack, type Quality, type VideoCodec } from 'mediabunny';

export const VIDEO_CODECS: VideoCodec[] = ['avc', 'vp9', 'av1'];

/**
 * Every tool that re-encodes picks its codec here, so this is also where the
 * browser's H.264 encoder is checked (once per page; a working variant is
 * registered with Mediabunny when its default settings are silent).
 */
export async function pickVideoCodec(
  size: { width: number; height: number; bitrate?: number | Quality },
  codecs: VideoCodec[] = VIDEO_CODECS,
): Promise<VideoCodec | null> {
  await requireH264Encoder();
  return getFirstEncodableVideoCodec(codecs, size);
}

export interface CodecPlan extends ProbePlan {
  codec: VideoCodec | null;
}

/** All the probes in one plan may take this long; past it the run goes ahead and its own ladder takes over. */
const PLAN_BUDGET_MS = 6000;

/** The codecs a try may write: VP9 only on the last rung, otherwise the usual order. */
export const codecsFor = (attempt: Attempt): VideoCodec[] => (attempt.vp9 ? ['vp9'] : VIDEO_CODECS);

const evenSide = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/**
 * pickVideoCodec, plus a test encode at the real output size before the file is decoded: when the H.264 encoder says yes to
 * the settings and then fails or goes silent at this size (iOS, Android Chrome, Edge), the plan says what does work, in order:
 * the same size with real-time latency (WebKit) or the software encoder (Chromium), then the next smaller sizes (1920, 1280, 854).
 * A refusal costs about a second here instead of a whole decode pass. Anything the probe cannot settle returns the plain pick.
 */
export async function planVideoCodec(
  size: { width: number; height: number; bitrate?: number | Quality },
  codecs: VideoCodec[] = VIDEO_CODECS,
): Promise<CodecPlan> {
  await requireH264Encoder();
  const codec = await getFirstEncodableVideoCodec(codecs, size);
  if (codec !== 'avc') return { codec };
  const bitrate = typeof size.bitrate === 'number' ? size.bitrate : 8_000_000;
  const until = Date.now() + PLAN_BUDGET_MS;
  const within = () => Date.now() < until;
  if (await encodesAtSize(size.width, size.height, bitrate)) return { codec };
  const rung = await sameSizeRung();
  if (rung && within() && (await encodesAtSize(size.width, size.height, bitrate, rung))) return { codec, ...rung };
  const longest = Math.max(size.width, size.height);
  for (let side = smallerSide(longest); side !== undefined && within(); side = smallerSide(side)) {
    const k = side / longest;
    const w = evenSide(size.width * k);
    const h = evenSide(size.height * k);
    if (await encodesAtSize(w, h, bitrate)) return { codec, maxSide: side };
    if (rung && within() && (await encodesAtSize(w, h, bitrate, rung))) return { codec, maxSide: side, ...rung };
  }
  return { codec };
}

/**
 * The sample rate to ask a re-encode for, so AAC is written as plain AAC-LC. Mediabunny
 * names AAC at 24 kHz or below as HE-AAC (mp4a.40.5), WebKit's encoder then writes AAC-LC
 * all the same, and the file claims SBR (half the real rate) in its header, which makes
 * ffmpeg and other strict players fail on the sound. Phone recordings at 16 kHz hit this.
 * Returns undefined (keep the source's rate) for anything above 24 kHz.
 */
export async function aacSafeSampleRate(track: InputAudioTrack | null | undefined): Promise<number | undefined> {
  if (!track) return undefined;
  return (await track.getSampleRate()) <= 24_000 ? 48_000 : undefined;
}
