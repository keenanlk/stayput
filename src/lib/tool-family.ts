/**
 * Which kind of heavy work a tool does, by its slug (the one inflight.ts stores in the marker). A lost run is remembered
 * for the family, so every tool of that family starts lighter on its next run in this tab. Pure: no storage, no DOM.
 * Preset pages (compress-video-for-discord, make-background-transparent …) carry their own slug, so the families
 * are matched by name as well as listed; tests/tablost-shared.spec.ts checks every tool and preset against this.
 */
export type Family = 'video' | 'model' | 'audio' | 'image' | 'archive' | 'pdf';

/** Cut out, enlarge, erase or redraw a picture with a neural network (or the person finder on video frames). */
const MODEL = /^(remove-background|upscale-image|remove-object|photo-to-sketch|blur-background|video-background-remover)$|background-remover|transparent|upscal|enlarge|erase|inpaint|sketch|remove-(object|person|watermark)/;
/** Decode a whole sound to PCM (or run a sound model). Speech tools are not here: they have their own tiny-model path. */
const AUDIO = /^(audio-converter|audio-reverser|audio-splitter|bpm-key-finder|compress-audio|merge-audio|mp3-to-midi|pitch-changer|remove-noise|remove-silence|trim-audio|video-to-mp3|volume-booster|vocal-remover)$|noise|vocal|karaoke|acapella|bpm|midi|silence|(^|-)(mp3|wav|m4a|flac|ogg|aac)(-|$)/;
const ARCHIVE = /^(archive-extractor|create-zip|rename-files|file-checksum)$|zip|archive|extract-(rar|7z)/;
const PDF = /pdf|epub|document-scanner|signature/;
const VIDEO = /video|^gif-to-mp4$|slideshow|screen-recorder|-to-(mp4|webm|avi|mov)$|^(mp4|mov|webm|avi|mkv)-to-/;

/** The speech tools: they keep their own lighter path (the tiny model), so they have no family here. */
const SPEECH = new Set(['transcribe', 'video-to-subtitles', 'auto-caption-video', 'add-subtitles-to-video']);

/** Tools that start light only after a lost run: their up-front size cap for an at-risk device already exists (remove-object's iOS canvas limit). */
export const LOST_ONLY = new Set(['remove-object']);

export function familyOf(slug: string): Family | undefined {
  if (SPEECH.has(slug)) return undefined;
  // The video-background person finder is a model, not an encoder-only job: it reuses Fast mode on phones.
  if (MODEL.test(slug)) return 'model';
  if (AUDIO.test(slug) && !/^audio-to-video$|^add-audio-to-video$/.test(slug)) return 'audio';
  if (VIDEO.test(slug)) return 'video';
  if (ARCHIVE.test(slug)) return 'archive';
  if (PDF.test(slug)) return 'pdf';
  // Everything else that holds pictures in canvases (images and animated images).
  return /image|photo|picture|gif|png|jpg|jpeg|webp|heic|avif|svg|icon|favicon|qr|barcode|collage|sticker|emote|passport|profile|border|crop|resize|rotate|exif|raw|pixel|ascii|sprite|watermark/.test(slug) ? 'image' : undefined;
}
