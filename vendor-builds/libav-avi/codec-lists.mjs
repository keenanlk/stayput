// What the AVI decoder build may and may not contain. Shared by check-codecs.mjs and tests/avi-decoder-build.spec.ts.

// h263 comes with mpeg4: FFmpeg builds both from the same source file (MPEG-4 Part 2 is a superset of baseline H.263).
export const SHIPPED_DECODERS = ['mpeg4', 'h263', 'mjpeg', 'mp3', 'mp2', 'ac3', 'pcm_s16le', 'pcm_u8', 'pcm_alaw', 'pcm_mulaw'];

export const ABSENT_DECODERS = [
  'wmv1', 'wmv2', 'wmv3', 'vc1', 'wmv3image', 'vc1image', 'vp6', 'vp6f', 'vp6a', 'flv', 'h264', 'hevc', 'vp8', 'vp9', 'av1',
  'msmpeg4v1', 'msmpeg4v2', 'msmpeg4v3', 'mpeg1video', 'mpeg2video', 'wmav1', 'wmav2', 'wmapro', 'wmalossless', 'wmavoice',
  'aac', 'aac_latm', 'adpcm_ms', 'adpcm_ima_wav', 'nellymoser', 'opus', 'vorbis', 'flac',
];

export const SHIPPED_DEMUXERS = ['avi'];
export const ABSENT_DEMUXERS = ['asf', 'flv', 'mov', 'matroska', 'mpeg', 'mpegts', 'ogg', 'wav', 'rm'];

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
  await check('decoder', [...new Set([...ABSENT_DECODERS, ...BANNED])].filter((n) => !SHIPPED_DECODERS.includes(n)), false, decoder);
  await check('demuxer', SHIPPED_DEMUXERS, true, demuxer);
  await check('demuxer', ABSENT_DEMUXERS, false, demuxer);
  await check('encoder', ['aac', 'libx264', 'mpeg4', 'mjpeg'], false, (n) => libav.avcodec_find_encoder_by_name(n));
  return { lines, wrong };
}

/**
 * Never in this build, by name (patents still in force or not yet cleared): the config and the built
 * module are both checked for these. The check fails on a match anywhere in config.json or ffmpeg-config.txt.
 */
export const BANNED = [
  'wmv1', 'wmv2', 'wmv3', 'wmv3image', 'vc1', 'vc1image', 'vp6', 'vp6f', 'vp6a', 'flv', 'flv1',
  'wmav1', 'wmav2', 'wmapro', 'wmalossless', 'wmavoice', 'nellymoser', 'asf', 'h264', 'hevc', 'aac',
];

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
