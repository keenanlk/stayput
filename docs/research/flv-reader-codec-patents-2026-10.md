# Codecs in the FLV reader: what is in, what is out, and why

Written 2026-10-13 for the FLV to MP4 tool. It records which codecs the FFmpeg-library build in `vendor-builds/libav-flv/` carries and the reasoning. It is a risk note, not a legal opinion. The LGPL grants no patent licence. The companion note for the AVI build is `avi-decoder-codec-patents-2026-10.md`.

## The approach: copy, do not decode

An FLV that holds H.264 picture and AAC sound already has the codecs an MP4 wants. The page reads the container (FLV demuxer) and writes the packets into an MP4 as they are. No H.264 or AAC decoder is compiled into the module, and no H.264 or AAC encoder runs for them either. The browser's own WebCodecs would be used if a decode were ever needed; none is.

## In the build

| Component (FFmpeg name) | Role | Basis |
|---|---|---|
| `flv` demuxer | Reads the FLV container (tags, the AVC and AAC sequence headers, timestamps). | Container format; no codec. FLV is an Adobe-published specification (Video File Format Specification v10.1). |
| `mp3` decoder, `mpegaudio` parser | Decodes MP3 sound so it can be written as AAC, or copied when the browser has no AAC encoder. | The last US MP3 patent (US 6,009,399) expired 2017-04-16; the licensing programme ended 2017-04-23. Same evidence as the AVI note. |

Not enabled: the H.264 and AAC parsers. The page reads picture size and the codec string from the avcC record with its own small SPS reader (`src/lib/h264-sps.ts`) and the AAC AudioSpecificConfig likewise, so the module contains no H.264 or AAC code at all.

## Copied through, not decoded

| Codec | Why it is acceptable here |
|---|---|
| H.264 video | Its patents are alive (Via LA pool). The page does not decode or encode it: the compressed packets are moved from one container to another, the same as the existing Video to MP4 tool does with an H.264 MOV or MKV. No H.264 implementation is shipped by Stayput for this tool. |
| AAC sound | Same: copied, never decoded or encoded by Stayput's code. |

## Out, and refused by name

| Codec | Why |
|---|---|
| VP6 (`vp6`, `vp6f`, `vp6a`) | On2 VP6 patents run in the US to about February 2027. Not compiled in; an FLV with VP6 shows "This FLV uses VP6 video, which Stayput can't open". |
| Sorenson Spark (`flv`, also called `flv1`), Nellymoser, Speex, Flash Screen Video | Out of scope for this task and not compiled in; each is refused by name the same way. |
| WMV1/2/3, VC-1, WMA, ASF | Never in this build (patent check of 2026-10-13). |
| HEVC and other "enhanced FLV" codecs | Not decoded; refused by name. |

The FLV demuxer's source mentions the VP6 and Spark codec ids so that it can label streams. That is only an identifier table (`avcodec_get_name` answers `vp6f` without any decoder). No VP6 or Spark decoder code is present, which `check-codecs.mjs` verifies by asking the built module.

## How it is enforced

- `vendor-builds/libav-flv/config.json` lists the components explicitly; the build uses `--disable-everything` and `ffmpeg-config.txt` is committed.
- `vendor-builds/libav-flv/check-codecs.mjs` asks the built module which decoders, encoders and demuxers exist and fails on any banned one (VP6 family, Spark, WMV, VC-1, WMA, Nellymoser, ASF, H.264, AAC, HEVC). `build.sh` runs it, and `tests/flv-decoder-build.spec.ts` runs the same check, plus the committed `configure-summary.txt`, in CI.
