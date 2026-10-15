// What the 3GP decoder build may and may not contain. Shared by check-codecs.mjs and tests/3gp-decoder-build.spec.ts.
// The page reads 3GP/3G2/MP4 with the MOV demuxer and decodes the video formats a browser has no decoder for
// (MPEG-4 Part 2 and H.263) and the AMR speech codecs. H.264 and AAC are copied as they are, never decoded here.

export const SHIPPED_DECODERS = ['mpeg4', 'h263', 'amrnb', 'amrwb'];

/** Decoders that must not be in the module: the patented ones (BANNED_CODECS) and every other codec a 3GP can hold. */
export const ABSENT_DECODERS = [
  'vp6', 'vp6f', 'vp6a', 'flv', 'wmv1', 'wmv2', 'wmv3', 'wmv3image', 'vc1', 'vc1image',
  'wmav1', 'wmav2', 'wmapro', 'wmalossless', 'wmavoice', 'nellymoser', 'h264', 'hevc', 'vp8', 'vp9', 'av1',
  'mjpeg', 'aac', 'aac_latm', 'mp3', 'mp2', 'ac3', 'evrc', 'qcelp', 'pcm_s16le',
];

export const SHIPPED_DEMUXERS = ['mov'];
export const ABSENT_DEMUXERS = ['avi', 'asf', 'flv', 'matroska', 'mpeg', 'mpegts', 'ogg', 'wav', 'rm', 'live_flv', 'kux', 'amr', 'amrnb', 'amrwb'];

/** Codecs that never go in, by FFmpeg name (patents still in force or not cleared). The config and the built module are both checked. */
export const BANNED_CODECS = [
  'vp6', 'vp6f', 'vp6a', 'flv', 'flv1', 'wmv1', 'wmv2', 'wmv3', 'wmv3image', 'vc1', 'vc1image',
  'wmav1', 'wmav2', 'wmapro', 'wmalossless', 'wmavoice', 'nellymoser',
];
/** Containers never in: ASF carries WMV/VC-1/WMA, and live FLV and KUX are other FLV flavours. */
export const BANNED_CONTAINERS = ['asf', 'live_flv', 'kux'];

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
  await check('decoder', [...new Set([...ABSENT_DECODERS, ...BANNED_CODECS])].filter((n) => !SHIPPED_DECODERS.includes(n)), false, decoder);
  await check('demuxer', SHIPPED_DEMUXERS, true, demuxer);
  await check('demuxer', [...new Set([...ABSENT_DEMUXERS, ...BANNED_CONTAINERS])], false, demuxer);
  await check('encoder', ['aac', 'libx264', 'mpeg4', 'mjpeg', 'libmp3lame', 'libopencore_amrnb'], false, (n) => libav.avcodec_find_encoder_by_name(n));
  return { lines, wrong };
}

/** Whether a component of this kind and FFmpeg name is banned. The "flv" demuxer is the one this build exists for. */
function bannedIn(kind, name) {
  if (kind === 'demuxer') return BANNED_CONTAINERS.includes(name) || (BANNED_CODECS.includes(name) && name !== 'flv');
  return BANNED_CODECS.includes(name);
}

/** Config text (config.json + ffmpeg-config.txt) must name only explicit components and no banned one. */
export function configProblems(configJson, ffmpegConfigTxt) {
  const problems = [];
  const entries = JSON.parse(configJson);
  const explicit = /^(avformat|avcodec|(demuxer|decoder|parser|bsf)-[a-z0-9_]+)$/;
  for (const e of entries) {
    if (!explicit.test(e)) problems.push(`config.json entry "${e}" is not an explicit avformat/avcodec/demuxer-/decoder-/parser-/bsf- name`);
    const m = /^(demuxer|decoder|parser|bsf)-(.+)$/.exec(e);
    if (m && bannedIn(m[1], m[2])) problems.push(`config.json enables banned component "${e}"`);
  }
  for (const line of ffmpegConfigTxt.split('\n')) {
    for (const m of line.matchAll(/--enable-(\w+)=(\S+)/g)) {
      if (bannedIn(m[1], m[2])) problems.push(`ffmpeg-config.txt enables banned component "${m[1]}=${m[2]}"`);
    }
    if (/--enable-(gpl|nonfree|version3|everything)\b/.test(line)) problems.push(`ffmpeg-config.txt has ${line.trim()}`);
  }
  return problems;
}

/** The configure summary (what FFmpeg printed as enabled) must list no banned decoder, parser or demuxer. */
export function summaryProblems(summaryTxt) {
  const problems = [];
  let section = '';
  for (const line of summaryTxt.split('\n')) {
    const h = /^Enabled (\w+):/.exec(line);
    if (h) {
      section = h[1];
      continue;
    }
    if (/^License:/.test(line)) section = '';
    const kind = { decoders: 'decoder', encoders: 'encoder', parsers: 'parser', bsfs: 'bsf', demuxers: 'demuxer' }[section];
    if (!kind) continue;
    for (const name of line.trim().split(/\s+/).filter(Boolean)) if (bannedIn(kind, name)) problems.push(`configure-summary lists banned ${kind} "${name}"`);
  }
  return problems;
}
