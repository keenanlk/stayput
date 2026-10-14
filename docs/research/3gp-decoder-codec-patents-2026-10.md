# Codecs in the 3GP decoder: what is in, what is out, and why

Written 2026-10-14 for the 3GP to MP4 tool. It records which codecs the FFmpeg-library build in `vendor-builds/libav-3gp/`
carries. It is a risk note, not a legal opinion; the LGPL grants no patent licence.

## In the build

| Component (FFmpeg name) | Role | Basis |
|---|---|---|
| `mov` demuxer | Reads 3GP, 3G2 and MP4 boxes. | Container only; ISO/IEC 14496-12 and 3GPP TS 26.244. |
| `mpeg4` decoder (also `h263`), `mpeg4video` parser | MPEG-4 Part 2 and baseline H.263 pictures. | Same component and same reasoning as the AVI build (`avi-decoder-codec-patents-2026-10.md`): H.263 dates from 1996 and MPEG-4 Part 2 from 1999, all patents long expired. |
| `amrnb` decoder | AMR narrowband speech (3GPP TS 26.071, 1999). | Specified 1999, so patents filed by then ran out by about 2019-2020. FFmpeg's own LGPL implementation, not the opencore library. |
| `amrwb` decoder | AMR wideband speech (G.722.2 / 3GPP TS 26.171, 2001). | Specified 2001, so patents expire by about 2021-2022; public discussion of the VoiceAge pool mentions two later families with claimed expiries of 2022 and 2024, both before this note. Not independently confirmed with a patent search: treat as low risk, not cleared. |

## Copied through, not decoded

H.264 video and AAC sound in a 3GP are moved packet by packet into the MP4, with no decoder compiled in, as the FLV page does.

## Out

WMV1-3, VC-1, VP6, WMA, WMA Pro and the ASF container are never in the build (patents in force until about 2027-2031);
`check-codecs.mjs` and `tests/3gp-decoder-build.spec.ts` fail on any of them, and on H.264, AAC, HEVC, MP3, AC-3.
