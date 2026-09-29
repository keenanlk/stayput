import { expect, test } from '@playwright/test';

/**
 * Codec choice, checked in Node with a stand-in VideoEncoder. The test browser
 * has no H.264 encoder, so the tool tests only ever exercise the VP9 fallback;
 * these make sure H.264 wins whenever a browser (Chrome, Edge, Safari) offers it.
 */

type Support = (codec: string) => boolean;
function fakeEncoder(supports: Support) {
  (globalThis as Record<string, unknown>).VideoEncoder = {
    isConfigSupported: async (config: { codec: string }) => ({ supported: supports(config.codec), config }),
  };
}

test.afterEach(() => {
  delete (globalThis as Record<string, unknown>).VideoEncoder;
});

test('video tools pick H.264 when the browser can encode it', async () => {
  fakeEncoder(() => true);
  const { pickVideoCodec } = await import('../src/lib/video-codec');
  expect(await pickVideoCodec({ width: 1280, height: 720 })).toBe('avc');
});

test('video tools fall back to VP9 only when H.264 is missing', async () => {
  fakeEncoder((codec) => !codec.startsWith('avc1'));
  const { pickVideoCodec } = await import('../src/lib/video-codec');
  // A size not used above, so the library's per-config memo does not answer.
  expect(await pickVideoCodec({ width: 1920, height: 1080 })).toBe('vp9');
});

test('GIF to MP4 tries H.264 first and falls back in order', async () => {
  fakeEncoder(() => true);
  const { supportedCodecs } = await import('../src/lib/gif-video');
  const all = await supportedCodecs(640, 480, 2_000_000, 30);
  expect(all.map((f) => f.candidate.name)).toEqual(['H.264', 'VP9', 'AV1']);
  expect(all[0]!.config.codec).toMatch(/^avc1\./);
  fakeEncoder((codec) => !codec.startsWith('avc1'));
  const noAvc = await supportedCodecs(640, 480, 2_000_000, 30);
  expect(noAvc[0]!.candidate.name).toBe('VP9');
});
