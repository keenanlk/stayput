# Codecs in the WMA decoder: patent reasoning

Written 2026-10-13 for the WMA to MP3 tool. It records what goes into the FFmpeg-library decoder build in `vendor-builds/libav-wma/` and why. It is a risk note, not a legal opinion. The LGPL grants no patent licence, so a codec is in the build only if its patent position is understood.

## In

| Codec (FFmpeg name) | What it is | Reasoning |
|---|---|---|
| Windows Media Audio 1 and 2, `wmav1` and `wmav2` | The standard WMA that Windows Media Player and MP3 players wrote from 1999 | Designed in 1998-2000 (WMA 1 in 1999, WMA 2 in 2000), a conventional MDCT transform codec of the same generation as AAC-LC's early drafts. Patents filed then run out about 20 years after filing, so by 2020-21 for the families that matter. Microsoft publishes no licence programme for them any more, and FFmpeg has shipped the two decoders for about 20 years without a claim. Marked as likely clear by the patent check of 2026-10-13. |
| ASF demuxer, `asf` | The container WMA is stored in | A container format with no transform or coding patents of its own; Microsoft's published ASF specification is the reference. |
| swresample | Sample-format conversion | Plain DSP, no codec patents. |

## Out

| Codec | Why |
|---|---|
| WMA Pro, `wmapro` | Introduced 2003; US patents run to about 2027-28. Not compiled in. |
| WMA Lossless, `wmalossless` | Same generation and family as WMA Pro. Not compiled in. |
| WMA Voice, `wmavoice` | Same family (2004 onward). Not compiled in. |
| WMV1, WMV2, WMV3, VC-1 (`vc1`), VP6 | Video codecs; the VC-1 pool runs to about 2031 and VP6 to about Feb 2027. A WMV file's video is never decoded: the build has no video decoders. |
| H.264, AAC, FLV, everything else | Out of scope for this tool. |

The page names the codec of a refused file ("This file uses WMA Pro, which Stayput can't open") instead of failing generically. The error class (`UnsupportedWmaCodec`) is the only thing recorded; the file, its name and its tags are never sent anywhere.

## What is actually in the file

`vendor-builds/libav-wma/check-codecs.mjs` asks the built module which decoders and demuxers exist; its output is committed as `vendor-builds/libav-wma/dist/check-codecs-output.txt`, and `tests/wma-decoder-build.spec.ts` runs the same check, plus the committed `configure-summary.txt`, on every CI run. FFmpeg's configure reported `LGPL version 2.1 or later` with `CONFIG_GPL 0` and `CONFIG_NONFREE 0`, with only `asf`, `wmav1` and `wmav2` enabled.
