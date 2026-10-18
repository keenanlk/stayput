# Edge-case file corpus

Odd, broken and extreme files for the most-used tools, run by `tests/edge-cases.spec.ts`. The suite finds failures; it does not fix them.

Every file here is **generated** by [`../make-edge-cases.mjs`](../make-edge-cases.mjs) (Node, with ffmpeg, ImageMagick 7, heif-enc and Pillow on the PATH, fixture tooling only), from synthetic test patterns, sine tones and plain text. There is no third-party material, no personal data and no photo of anyone, so there is nothing to license: the files are released under the repository's licence. Re-run the script to rebuild the folder. A few cases reuse older files from `../static/` (listed below, with their own credits in `../static/CREDITS.md`). Nothing here is bigger than 300 KB (1.8 MB in all). Codecs: H.264, HEVC (decode only, in the browser), VP9, AAC, MP3, Opus, Vorbis, FLAC, PCM, mu-law. No wmv3, vc1, vp6 or wmapro.

## Tools under test

The most-used tools by completed runs from 8 Oct to 15 Oct 2026 (`metrics/latest-28d.md`; Umami run data starts Oct 8, so "28 days" is really that week). A preset is counted under its own page.

| # | Page | Completed runs | Takes |
|---|------|---------------:|-------|
| 1 | /burn-subtitles-into-video | 247 | video |
| 2 | /video-to-subtitles | 140 | video, audio |
| 3 | /remove-background-noise-from-video | 127 | video, audio |
| 4 | /tools/remove-noise | 124 | audio, video |
| 5 | /tools/volume-booster | 108 | audio, video |
| 6 | /blur-video-background | 92 | video |
| 7 | /instagram-carousel-splitter | 70 | pictures |
| 8 | /increase-video-volume | 56 | video |
| 9 | /auto-caption-video | 45 | video |
| 10 | /tools/video-background-remover | 43 | video |
| 11 | /tools/blur-face-video | 42 | video |
| 12 | /ogg-to-mp3 | 40 | audio, video |
| 13 | /tools/resize-video | 33 | video |
| 14 | /tools/crop-pdf | 27 | PDF |
| 15 | /image-to-pixel-art | 24 | pictures |

The three speech tools (1, 2, 9) run with the speech model replaced by a stand-in that returns one caption, because what is tested there is how the file is read and what a failure is called, not the model. Everything else runs for real.

## What a case must do

Exactly one of: **(a)** a result whose files are not empty and open (a picture decodes, a video loads with a picture and a length, a sound decodes, and a video that was turned still comes out upright and as long as the input), or **(b)** an early refusal: readable copy in the error panel and, for a refusal after Run, a named error class (not `Error`, not empty). Files refused the moment they are added (empty files) never start a run, so they have no class. A run with no outcome within 40 s (100 s for tools that load a model) fails as a **hang**; a crashed tab fails as a **crash**. Cases that fail today are listed in `KNOWN` in the spec under `test.fail()`, each with its hardening item (below), so CI stays green and the case turns red the day it is fixed.

## Files

Which tools see a file depends on what they take. "Good" files must give a result; "refusal" files must be refused; "either" may do either, but never a hang, a bare error or a blank result.

| File | What it is | Expected |
|------|-----------|----------|
| `good.mp4`, `good.webm` | 2 s, 320x240, H.264/AAC and VP9/Opus | result |
| `mp4-named.mov` | the MP4 above under a .mov name | result |
| `rotated-90.mp4` | upright phone clip: picture 320x240 turned 90 degrees by the display matrix, shows 240x320 | result, upright |
| `vfr.mp4` | variable frame rate (frames dropped irregularly, timestamps kept) | result |
| `silent-track.mp4` | an AAC track of digital silence | either |
| `no-audio.mp4`, `tiny-16x16.mp4` | video with no sound track at all; a 16x16 picture | either; sound tools refuse as NoSoundTrack |
| `hevc.mp4`, `hdr10-hevc.mp4` | HEVC 8-bit; HEVC 10-bit HDR10 (BT.2020, PQ) | either (a browser without an HEVC decoder must refuse as UnsupportedCodec) |
| `audio-only-named.mp4` | an M4A under an .mp4 name | either |
| `zeros.mp4` | 64 KB of zero bytes: what a cloud-only placeholder looks like on a phone | refusal |
| `sample.ts`, `mjpeg.mov`, `ac3-51.mkv`, `odd-853x481.webm`, `truncated-moov-end.mp4`, `alac.m4a`, `rf64.wav`, `garbage.jpg` | MPEG-TS; Motion JPEG + PCM in MOV; 5.1 AC-3 in MKV; odd 853x481 VP9; the good MP4 minus its last 4 KB; ALAC; RF64 WAV; a JPEG that is noise after four bytes. Commands adapted from the failure catalogues (`hardening/*.md`) | `garbage.jpg` refusal, others either (`odd-853x481.webm` has no sound track, so sound tools must refuse it as NoSoundTrack) |
| `zero.mp4`, `zero.mp3`, `zero.png`, `zero.pdf` | 0 bytes | refused when added |
| `truncated-half.*` (mp4, mp3, png, jpg, pdf) | the good file cut in half | either |
| `corrupt-header.*` (mp4, mp3, wav, png, jpg, pdf) | header bytes changed (`ftyp`/`moov` renamed, `RIFX`, `PNX`, `%PDX`, zeroed JPEG start, 4 KB of 0xFF on the MP3) | refusal (the MP3 may also be resynced) |
| `text-named.*` (mp4, mp3, png, pdf), `png-named.jpg`, `jpg-named.png`, `png-named.pdf` | text, or a picture, under the wrong extension | refusal for text; result for PNG/JPEG swaps |
| `good.mp3`, `good.ogg` (Vorbis), `flac24.flac` (24-bit) | 2 s, 440 Hz | result |
| `mulaw-8k.wav`, `pcm24-48k-stereo.wav`, `float32.wav`, `pcm8-11k.wav` | G.711 mu-law 8 kHz; 24-bit 48 kHz stereo; 32-bit float; 8-bit 11 kHz | result |
| `silent.wav`, `silent.mp3` | 2 s of digital silence | either |
| `wav-length-lies.wav` | the data chunk claims 2 GB, the file holds 288 KB | either |
| `good.png`, `good.jpg`, `alpha.png`, `1x1.png` | 160x120 picture; transparent circle; one pixel | result (1x1 either) |
| `cmyk.jpg`, `png16.png`, `gray16.png` | CMYK JPEG; 16-bit PNG; 16-bit grey PNG | result |
| `exif-rotated.jpg` | EXIF orientation 6 | result |
| `heic-still.heic`, `heic-alpha.heic`, `heic-tiled.heic`, `heic-10bit.heic` | HEIC still; with alpha; HEIF tiled (64 px tiles); 10-bit. heif-enc cannot write the `grid` layout iPhones use, so a true iPhone grid file is not in the corpus | result (tiled and 10-bit either) |
| `good.pdf`, `broken-xref.pdf` | 2-page PDF; same with the xref table broken | result; either |

Reused from `../static/`: `uhd-flat.mp4` (3840x2160, no sound), `user-locked.pdf` (needs a password: refusal), `owner-locked.pdf`.

Made when the suite runs and never committed (`tests/edge-cases-files.ts`): a 50 megapixel PNG (8160x6120) and a 400 megapixel PNG (20000x20000), each a few hundred KB because the picture is flat; and 20 minutes of 16 kHz mono WAV (38 MB) for the two audio tools.

The exact words the person sees for each error class are in [ERROR-CLASSES.md](ERROR-CLASSES.md).

## Known failures (hardening items)

| Item | Plan item (growth hardening plan) | Cases | What happens | Suggested fix |
|------|-----------|-------|--------------|---------------|
| C3 | H24 | 20000x20000 PNG on instagram-carousel-splitter and image-to-pixel-art; Chromium | the browser's raw text ("Failed to execute 'createImageBitmap' on 'Window': The ImageBitmap could not be allocated") is shown and the failed run is not recorded; WebKit refuses it cleanly | check the pixel count before decoding and refuse with a named `TooLarge` and plain copy; wrap the decode failure |

## Passing, but on record for the hardening plan

These end in a named refusal, so they pass; the plan items say what would make them better.

- `zeros.mp4` (all-zero placeholder) is `UnreadableFile` on video tools and `AudioDecodeError` on sound tools; the plan's `FileNotDownloaded` (H3) would say what is wrong.
- `sample.ts` (MPEG-TS) is `UnreadableFile` on most video tools; `UnsupportedContainer` and TS reading are plan item H3. Remove noise, Volume booster and Video to subtitles read it already.
- `ac3-51.mkv` and `alac.m4a` are `AudioDecodeError` with a format-specific message on the caption tools and the generic one elsewhere (H18).
- `mjpeg.mov` is `UnsupportedCodec` with the HEVC wording, which does not fit a Motion JPEG file.
- `audio-only-named.mp4` on Burn subtitles ends in the "could not be redrawn" message although there was never a picture to redraw.
