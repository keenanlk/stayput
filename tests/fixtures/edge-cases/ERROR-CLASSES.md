# Error classes for the most-used tools

The class a failed run records (`error_class`) with the exact words the person sees today, as of this commit. `<name>` stands for the file's name, which the page puts in front of some messages. Nothing here was changed by the edge-case suite.

## Hit by the edge-case suite

| Class | Thrown in | Message shown now | Seen on |
|-------|-----------|-------------------|---------|
| *(none: refused when the file is added, no run is recorded)* | `src/lib/shell.ts:220` | `<name> is empty (0 bytes). It may not have finished downloading or syncing.` | every tool, empty files |
| `AudioDecodeError` | `src/lib/speech-errors.ts:42` (default text), `src/lib/speech-audio.ts:166` | `<name>: No audio could be read from this file. It may have no sound track, or use an audio format this browser cannot decode.` (the speech pages say "can't") | corrupt, truncated, all-zero and wrong-extension media on every sound tool |
| `AudioDecodeError` | `src/tools/volume-booster.ts:55` | `<name> has no sound to change.` | volume-booster, increase-video-volume, on a video with no sound track |
| `AudioDecodeError` | `src/tools/remove-noise.ts:51` | `<name> has no sound to clean.` | remove-noise, remove-background-noise-from-video, on a video with no sound track |
| `AudioDecodeError` | `src/lib/speech-audio.ts:131` | `<name>: This file's sound is Dolby Digital (AC-3), which this browser can't decode. Try Chrome or Edge on a computer, or save the video again with AAC sound and add that.` | `ac3-51.mkv` on the caption tools |
| `AudioDecodeError` | `src/lib/speech-audio.ts` (format table) | `<name>: This file's sound is the "alac" format, which this browser can't decode. Try Chrome or Edge on a computer, or save the video again with AAC sound and add that.` | `alac.m4a` on the caption tools |
| `NoSoundTrack` | `src/lib/demux-audio.ts:45` | `<name>: No sound track was found in this file, so there is no speech to write down.` | caption tools, on a video with no sound track |
| `UnreadableFile` | `src/lib/video-edit.ts:204` | `<name>: This file is not a video this page can read (MP4, MOV, WebM or MKV).` | video tools: text, zeros, corrupt header, MPEG-TS |
| `UnreadableFile` | `src/lib/video-edit.ts:206` | `<name>: This file has no video track.` | video tools: audio-only file, truncated MP4 |
| `UnreadableFile` | `src/lib/video-edit.ts:157`, `src/lib/video-frames.ts:57`, `src/lib/video-audio.ts:78` | `<name> has no video this page can read (MP4, MOV, WebM or MKV).` / `This file has no video this page can read (MP4, MOV, WebM or MKV).` | Motion JPEG MOV, truncated files |
| `UnreadableFile` | `src/lib/speech-errors.ts` (`encodeFailedError`) | `The video could not be redrawn with captions. Your subtitles are ready: download the .srt below, then try a shorter video or another file.` | Burn subtitles, on an audio-only file and on MPEG-TS |
| `UnsupportedCodec` | `src/lib/video-compress.ts:72` | `This browser cannot decode this video. iPhone videos are often HEVC (H.265), which Chrome and Firefox on Windows or Linux cannot read: try Safari, or set the iPhone camera to "Most Compatible".` | HEVC and HDR clips; also shown for a Motion JPEG clip, where the HEVC wording does not fit |
| `InputError` | `src/tools/crop-pdf.ts:175` | `Choose what to keep first: press Trim white margins, or drag a box on the page.` | Crop PDF, whenever Run is pressed before an area is chosen (also after a PDF that did not open) |
| `ImageFailed` | `src/lib/image.ts:46` | `<name>: This file could not be decoded as an image.` | carousel splitter and pixel art, corrupt or wrong-extension pictures |
| *(none recorded)* | browser, raw | `Failed to execute 'createImageBitmap' on 'Window': The ImageBitmap could not be allocated.` | carousel splitter and pixel art, 400 MP picture in Chromium (item C3) |

## Other classes thrown for these tools

| Class | Thrown in | Message |
|-------|-----------|---------|
| `NotReadableError` | `src/lib/read-failure.ts:19` | `This file could not be read. Pick the video again, or copy it to the phone first, and try again.` |
| `OutOfMemoryError` | `src/lib/person-mask.ts:112` | `This video is too large for this device's memory. Try a shorter or smaller video.` |
| `OutOfMemoryError` | `src/lib/denoise.ts:129` | `This device ran out of memory cleaning this video. Trim the video to a shorter length first, or use a computer.` |
| `OutOfMemoryError` | `src/lib/speech-errors.ts` | `This device ran out of memory while writing captions. Close other tabs and apps and try again, use a shorter recording, or use a desktop browser.` / `This video is too long for your browser to redraw with captions. Your subtitles are ready: download the .srt below, or trim or split the video and try again. To try again, reload the page first.` / `This phone ran out of memory while writing captions for a video this big. Trim the video to about 2 minutes or less, or use a computer. If you try again, reload the page first.` |
| `ModelDownloadError` | `src/lib/speech-errors.ts` | `The speech model (77 MB) could not be downloaded. Check your connection, then try again: a download that stopped part way starts over. On mobile data, Wi-Fi is steadier.` |
| `ModelLoadError` | `src/lib/speech-errors.ts` | `The speech model downloaded but could not be started in this browser. Reload the page and try again, or use an up-to-date Chrome, Edge or Firefox on a computer.` |
| `ModelLoadError` | `src/lib/person-mask.ts:146` | the browser's own message, or `The person finder could not be started in this browser.` |
| `WorkerCrashError` | `src/lib/speech-errors.ts` | `The speech model stopped unexpectedly, which usually means the browser ran short of memory. Close other tabs and try again, or use a shorter recording.` |
| `SpeechModelError` | `src/lib/speech-errors.ts` | `The speech model could not read this recording. Try again, or try a shorter recording or another file.` |
| `NoSpeechFound` | `src/lib/speech-errors.ts` | set where it is raised (the caption pages) |
| `NoiseDecodeError` | `src/lib/denoise.ts:129` | `The sound of this file could not be read. Try a shorter clip or another file.` |
| `NoiseRemoveError` | `src/lib/denoise.ts:129` | `The noise could not be removed from this sound. Reload the page and try again, or try a shorter clip.` |
| `NoiseWriteError` | `src/lib/denoise.ts:129` | `The cleaned video could not be written. Reload the page and try again, or try a shorter clip.` |
| `NoiseModelLoadError` | `src/lib/denoise.ts:33` | `The noise remover could not load. Check your connection and try again.` |
| `PersonFinderStalled` | `src/lib/person-mask.ts:298` | `Finding the person took more than 5 seconds a frame on this device, so the run was stopped. Try a shorter or smaller video, or choose Fast.` |
| `EncoderStall` | `src/lib/encoder-watchdog.ts:26`, `src/lib/encoder-probe.ts:192` | set by the caller (the encoder stopped producing frames) |
| `EncoderUnavailable` | `src/lib/encoder-probe.ts:204` | set by the caller |
| `EncoderRefused` | `src/lib/encoder-probe.ts:217` | `This device's video encoder refused to start, even at smaller sizes. Try a recent Chrome or Edge, or a computer.` |
| `AudioEncoderLoadError` | `src/lib/mp3-fallback.ts:33` | `The sound encoder could not load. Check your connection and try again.` |
| `NoAudioEncoder` | `src/lib/mp3-fallback.ts:79` | set by the caller |
| `AudioEncodeUnsupported` | `src/lib/audio-convert.ts:99` | the AAC message in that file |
| `UnreadableFile` | `src/lib/video-audio.ts:80, 90` | `<name> uses a video format this browser cannot copy.` / `<name> has no sound this browser can read. Try an MP3, WAV, M4A or another video.` |
| `UnreadableFile` | `src/lib/pdf.ts:52, 126-140` | `This file could not be opened as a PDF (<detail>).` / `This file could not be read as a PDF. It may be damaged (<detail>).` / `This PDF uses an encryption method that could not be removed in the browser.` / `This file is empty.` / `This file is not a PDF. It does not start with a PDF header.` |
| `InputError` | `src/lib/unlock.ts:224` | `This PDF is password-protected. Enter its password to open it, or remove the password in the app that created it.` |
| `NothingProduced` | `src/lib/shell.ts:511` | `Nothing was produced. Check the options and try again.` |
| `VideoWriteError` | `src/lib/video-audio.ts:152` | `The video could not be written.` |
| `Error` (bare, no class) | `src/lib/image.ts:35, 145, 157, 165, 223`, `src/lib/heic.ts:22`, `src/lib/codecs.ts:25, 41`, `src/lib/person-mask.ts:157, 171, 269` | `Canvas is not available in this browser.` / `The WebP encoder could not be loaded (<detail>). Check your connection and try again.` / `The browser could not encode this image.` / `This browser cannot save <TYPE> images.` / `This file could not be decoded as JPEG XL or AVIF (<detail>).` / the HEIC text in `heic.ts` / `The person finder needs WebGL, which this browser does not provide. Turn on hardware acceleration in the browser settings, or use an up-to-date Chrome, Edge, Firefox or Safari.` / `The graphics chip did not start the person finder in time` / `The person finder returned no mask.` |
