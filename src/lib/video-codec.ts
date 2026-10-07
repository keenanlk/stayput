/**
 * Which video codec the browser should write. H.264 plays everywhere (iPhone
 * Photos, WhatsApp, PowerPoint, every TV), so it is always tried first; VP9 and
 * AV1 are the fallback where a browser has no H.264 encoder (some Linux builds).
 */
import { requireH264Encoder } from './encoder-probe';
import { getFirstEncodableVideoCodec, type Quality, type VideoCodec } from 'mediabunny';

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
