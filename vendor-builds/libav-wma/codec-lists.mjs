// What the WMA decoder build may and may not contain. Shared by check-codecs.mjs and tests/wma-decoder-build.spec.ts.

/** Windows Media Audio versions 1 and 2 only (see docs/research/wma-decoder-codec-patents-2026-10.md). */
export const SHIPPED_DECODERS = ['wmav1', 'wmav2'];

/** Never in this build: patents still in force (WMA Pro, WMA Voice, WMA Lossless, VC-1, WMV, VP6) or not needed. */
export const BANNED = [
  'wmapro', 'wmalossless', 'wmavoice', 'wmv1', 'wmv2', 'wmv3', 'wmv3image', 'vc1', 'vc1image', 'vp6', 'vp6f', 'vp6a', 'flv', 'flv1',
  'h264', 'hevc', 'aac', 'aac_latm', 'nellymoser',
];

export const ABSENT_DECODERS = [
  ...BANNED, 'vp8', 'vp9', 'av1', 'mpeg4', 'mjpeg', 'msmpeg4v1', 'msmpeg4v2', 'msmpeg4v3', 'mp3', 'mp2', 'ac3', 'adpcm_ms',
  'pcm_s16le', 'opus', 'vorbis', 'flac',
];

export const SHIPPED_DEMUXERS = ['asf'];
export const ABSENT_DEMUXERS = ['avi', 'flv', 'mov', 'matroska', 'mpeg', 'mpegts', 'ogg', 'wav', 'rm', 'asf_o'];

/** Asks a loaded libav instance which of the names exist. Returns a line per name and the count that were wrong. */
export async function inspect(libav) {
  const lines = [];
  let wrong = 0;
  const check = async (kind, names, want, find) => {
    for (const n of names) {
      const found = (await find(n)) !== 0;
      if (found !== want) wrong++;
      lines.push(`${found === want ? 'ok  ' : 'FAIL'} ${kind} ${n.padEnd(14)} ${found ? 'present' : 'absent '}`);
    }
  };
  const decoder = (n) => libav.avcodec_find_decoder_by_name(n);
  const demuxer = (n) => libav.av_find_input_format(n);
  await check('decoder', SHIPPED_DECODERS, true, decoder);
  await check('decoder', [...new Set(ABSENT_DECODERS)].filter((n) => !SHIPPED_DECODERS.includes(n)), false, decoder);
  await check('demuxer', SHIPPED_DEMUXERS, true, demuxer);
  await check('demuxer', ABSENT_DEMUXERS, false, demuxer);
  await check('encoder', ['aac', 'libx264', 'mpeg4', 'wmav1', 'wmav2'], false, (n) => libav.avcodec_find_encoder_by_name(n));
  return { lines, wrong };
}

/** Config text (config.json + ffmpeg-config.txt) must name only explicit components and no banned one. */
export function configProblems(configJson, ffmpegConfigTxt) {
  const problems = [];
  const entries = JSON.parse(configJson);
  const explicit = /^(avformat|avcodec|swscale|swresample|(demuxer|decoder|parser)-[a-z0-9_]+)$/;
  for (const e of entries) {
    if (!explicit.test(e)) problems.push(`config.json entry "${e}" is not an explicit avformat/avcodec/swscale/swresample/demuxer-/decoder-/parser- name`);
    const name = e.replace(/^(demuxer|decoder|parser)-/, '');
    if (BANNED.includes(name)) problems.push(`config.json enables banned component "${e}"`);
  }
  for (const line of ffmpegConfigTxt.split('\n')) {
    const m = /^--enable-(\w+)=(\S+)$/.exec(line.trim());
    if (m && BANNED.includes(m[2])) problems.push(`ffmpeg-config.txt enables banned component "${m[1]}=${m[2]}"`);
    if (/--enable-(gpl|nonfree|version3|everything)\b/.test(line)) problems.push(`ffmpeg-config.txt has ${line.trim()}`);
  }
  return problems;
}

/** The "Enabled decoders:" block of configure-summary.txt as a list of names. */
export function summaryDecoders(summary) {
  const block = /Enabled decoders:\n([\s\S]*?)\n\n/.exec(summary)?.[1] ?? '';
  return block.split(/\s+/).filter(Boolean);
}
