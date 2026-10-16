/**
 * WMA on the page. Browsers have no WMA decoder, so the file is handed to a worker that loads a
 * decoder built from FFmpeg's libraries (LGPL, libav.js, served from /vendor/ and fetched only
 * now) with the ASF demuxer and Windows Media Audio 1 and 2 only; see wma-decode.worker.ts. The
 * samples come back as an AudioBuffer, so every audio tool treats a WMA like any other sound.
 */
import { vendorEntry } from './vendor';
import { fromWorkerFailure } from './worker-error';
import { ProtectedWma } from './wma-errors';
import type { WmaJob, WmaMessage, WmaTags } from './wma-decode.worker';
import { NamedError } from './input-error';

/** The ASF header object's GUID (75B22630-668E-11CF-A6D9-00AA0062CE6C), which every WMA, WMV and ASF file starts with. */
const ASF_HEADER = [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c];
/** Content Encryption Object and Extended Content Encryption Object: what Windows Media DRM adds to the header. */
const DRM_OBJECTS = [
  [0xfb, 0xb3, 0x11, 0x22, 0x23, 0xbd, 0xd2, 0x11, 0xb4, 0xb7, 0x00, 0xa0, 0xc9, 0x55, 0xfc, 0x6e],
  [0x14, 0xe6, 0x8a, 0x29, 0x22, 0x26, 0x17, 0x4c, 0xb9, 0x35, 0xda, 0xe0, 0x7e, 0xe9, 0x28, 0x9c],
];

const has = (hay: Uint8Array, needle: number[], from = 0) => {
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

/** True when the file starts like an ASF container (WMA, WMV), whatever its name says. */
export async function isAsf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return head.length === 16 && ASF_HEADER.every((b, i) => head[i] === b);
}

/** Tags found by the last decode of each buffer, for tools that can write them. */
const tagsByBuffer = new WeakMap<AudioBuffer, WmaTags>();
export const wmaTagsOf = (buffer: AudioBuffer): WmaTags | undefined => tagsByBuffer.get(buffer);

/** Decodes a WMA to an AudioBuffer at `rate` (stereo at most). */
export async function decodeWma(file: File, rate: number): Promise<AudioBuffer> {
  // The header (the first 64 KB is plenty) says whether the sound is encrypted.
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  if (DRM_OBJECTS.some((g) => has(head, g, 16))) throw new ProtectedWma();
  const worker = new Worker(new URL('./wma-decode.worker.ts', import.meta.url), { type: 'module' });
  try {
    const done = await new Promise<Extract<WmaMessage, { type: 'done' }>>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WmaMessage>) => {
        const m = e.data;
        if (m.type === 'done') resolve(m);
        else if (m.type === 'error') reject(fromWorkerFailure(m.name, m.message));
      };
      worker.onerror = (e) => reject(new NamedError('WmaConvertFailed', e.message || 'The WMA decoder stopped unexpectedly.'));
      const job: WmaJob = { file, entry: vendorEntry('libav-wma'), rate };
      worker.postMessage(job);
    });
    const buffer = new AudioBuffer({ length: done.channels[0]!.length, numberOfChannels: done.channels.length, sampleRate: done.sampleRate });
    done.channels.forEach((ch, c) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, c));
    tagsByBuffer.set(buffer, done.tags);
    return buffer;
  } finally {
    worker.terminate();
  }
}

/** An ID3v2.3 tag with the title, artist and album that were set, or null when none were. */
export function id3Tag(tags: WmaTags | undefined): Uint8Array | null {
  if (!tags) return null;
  const frame = (id: string, text: string) => {
    // Encoding byte 1 is UTF-16 with a byte-order mark, which every ID3v2.3 reader takes.
    const body = new Uint8Array(1 + 2 + text.length * 2 + 2);
    body[0] = 1;
    body[1] = 0xff;
    body[2] = 0xfe;
    for (let i = 0; i < text.length; i++) {
      body[3 + i * 2] = text.charCodeAt(i) & 0xff;
      body[4 + i * 2] = text.charCodeAt(i) >> 8;
    }
    const out = new Uint8Array(10 + body.length);
    out.set([...id].map((c) => c.charCodeAt(0)), 0);
    new DataView(out.buffer).setUint32(4, body.length);
    out.set(body, 10);
    return out;
  };
  const frames = [tags.title && frame('TIT2', tags.title), tags.artist && frame('TPE1', tags.artist), tags.album && frame('TALB', tags.album)].filter((f): f is Uint8Array<ArrayBuffer> => !!f);
  if (!frames.length) return null;
  const size = frames.reduce((n, f) => n + f.length, 0);
  const out = new Uint8Array(10 + size);
  out.set([0x49, 0x44, 0x33, 3, 0, 0], 0);
  // Synchsafe size: seven bits per byte.
  out.set([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f], 6);
  let at = 10;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}
