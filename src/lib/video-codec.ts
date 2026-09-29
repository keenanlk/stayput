/**
 * Which video codec the browser should write. H.264 plays everywhere (iPhone
 * Photos, WhatsApp, PowerPoint, every TV), so it is always tried first; VP9 and
 * AV1 are the fallback where a browser has no H.264 encoder (some Linux builds).
 */
import { getFirstEncodableVideoCodec, type Quality, type VideoCodec } from 'mediabunny';

export const VIDEO_CODECS: VideoCodec[] = ['avc', 'vp9', 'av1'];

export function pickVideoCodec(size: { width: number; height: number; bitrate?: number | Quality }): Promise<VideoCodec | null> {
  return getFirstEncodableVideoCodec(VIDEO_CODECS, size);
}
