/**
 * Which video codec the browser should write. H.264 plays everywhere (iPhone
 * Photos, WhatsApp, PowerPoint, every TV), so it is always tried first; VP9 and
 * AV1 are the fallback where a browser has no H.264 encoder (some Linux builds).
 */
import { requireH264Encoder } from './encoder-probe';
import { getFirstEncodableVideoCodec, type InputAudioTrack, type Quality, type VideoCodec } from 'mediabunny';

export const VIDEO_CODECS: VideoCodec[] = ['avc', 'vp9', 'av1'];

/**
 * Every tool that re-encodes picks its codec here, so this is also where the
 * browser's H.264 encoder is checked (once per page; a working variant is
 * registered with Mediabunny when its default settings are silent).
 */
export async function pickVideoCodec(size: { width: number; height: number; bitrate?: number | Quality }): Promise<VideoCodec | null> {
  await requireH264Encoder();
  return getFirstEncodableVideoCodec(VIDEO_CODECS, size);
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
