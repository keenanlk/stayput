# Video background removal: speed, speed-ups and stating the time

October 2026. Covers the Video background remover and its two presets
(`/tools/video-background-remover`, `/blur-video-background`, `/green-screen-video`),
which share one code path: `src/tools/video-background.ts` → `src/lib/person-mask.ts`
→ `src/lib/video-edit.ts`.

## Summary

- On a Mac (M3 Max) a 30 fps video takes about **6 times its own length** in both Chromium and WebKit,
  at 720p and at 1080p: **about 5.5 to 7 minutes per minute of video**.
- **About 80% of that time is the person-finder model** (MediaPipe selfie *multiclass* segmenter,
  256×256, running as WebAssembly on the CPU): about 160 ms per frame, so about 6 frames per second
  whatever the video's resolution. Decoding and encoding together cost under 10% (the Mac's hardware
  codecs do a 10 s clip in 2 to 6 s).
- The biggest cheap win is a **smaller model**: Google's binary selfie segmenter is 0.25 MB (against
  16 MB), about **28 times faster per frame**, and cut a 10 s clip from 61 s to 14 s (**4.4×**) in Chromium and from 61 s
  to 17 s (**3.5×**) in WebKit. Edge quality on real footage still has to be checked.
- Other measured options: running the model on every 2nd or 3rd frame (1.7× and 2.1×); the GPU delegate
  (about 3 to 4× in WebKit and in headed Chromium, not yet verified on a phone). Shrinking the picture handed to the model
  does nothing, because the model's input is already fixed at 256×256.
- **Recommendation: yes, show an estimated time**, from the speed of the first few seconds of real work,
  updated as it runs. Proposed copy at the end.

All numbers below are from one Mac, one run each (see "Limits"). Treat them as ±15%.

## Method

Reproduce with the script and patch in this repository.

1. Make a build copy outside `.worktrees/` (Astro cannot build inside a git worktree), `npm ci`.
2. Apply the timing hooks: `git apply docs/research/video-background-timing-hooks.patch`
   (it adds `window.__vbg` counters in `person-mask.ts` and `video-edit.ts`, plus experiment knobs
   `__vbgDelegate`, `__vbgModel`, `__vbgEvery`, `__vbgWork`, `__vbgSkip`; **do not commit it**).
   `npm run build`.
3. Make the clips (dev tooling; any 30 fps video with a person works):
   a 30 s test pattern (`testsrc2`) at 1280×720 and at 1920×1080, H.264 CRF 20, 30 fps, AAC sound,
   with the `tests/fixtures/static/face.jpg` portrait swaying across it. The first 10 s of each was
   used for most runs (302 frames); one 30 s run confirmed the 10 s figures scale linearly.
4. `node docs/research/bench-video-background.mjs --clip 720p=/path/720p-10s.mp4 --browser chromium,webkit --bg blur --runs 1 --json out.json`
   Each run is a fresh browser context: it drops the clip on `/tools/video-background-remover`, presses
   the button and times the run to the result card. `--delegate GPU`, `--every 2`, `--work 256`,
   `--model /models/x.tflite`, `--skip` drive the experiment knobs. `--headed` and
   `--chromium-args` are there for GPU runs.

Setup: Apple M3 Max, 36 GB, macOS; Playwright 1.63 (Chromium headless shell 1243, WebKit build 2359),
local static server with the production CSP headers. Other apps were open (load average 4 to 7 on 14 cores).
Model files and WebAssembly came from localhost, so download time is not in the numbers (the model start-up
is excluded from the per-frame figures but included in "wall" for the 1st frame).

"s per video minute" = wall seconds for the clip × 6 (a 10 s clip), at 30 fps. At 60 fps double it;
the work scales with frame count, not with resolution.

## 1. How fast is it today

Blur background (the default), production code:

| Browser | Clip | Wall for 10 s | Seconds per video minute | × real time |
|---|---|---|---|---|
| Chromium | 720p | 61.4 s | 368 | 6.1× |
| Chromium | 1080p | 70.3 s | 422 | 7.0× |
| WebKit | 720p | 61.1 s | 367 | 6.1× |
| WebKit | 1080p | 63.7 s | 382 | 6.4× |
| Chromium, 30 s clip | 720p | 177.8 s (for 30 s) | 356 | 5.9× |

Flat colour or picture background (no blur): Chromium 720p 55.1 s (331 s/min), WebKit 720p 55.5 s (333 s/min).

Against the real-iPhone check on Oct 12 (about 2 minutes of video in about 5 to 10 minutes in Safari,
so 2.5 to 5×; phone model, frame rate and resolution not recorded): the Mac is **not faster** than the
phone. The model runs single-threaded WebAssembly, so it is bound by one core, and the phone's core is about as quick as the Mac's.
The phone figure is also a rough recollection, so the two are consistent rather than contradictory.
Expect most recent phones to land at 2.5 to 7× real time with the current model, slower for 60 fps clips, and
older or throttled phones to be slower still. This is an estimate, not a measurement.

### Where the time goes (10 s clip, 302 frames, blur background)

| Stage | Chromium 720p | Chromium 1080p | WebKit 720p | WebKit 1080p |
|---|---|---|---|---|
| Model inference (`segmentForVideo`) | 48.9 s (80%) | 48.8 s (69%) | 50.0 s (82%) | 52.1 s (82%) |
| Blur the background (box blur at ≤480 px, scaled up) | 3.9 s (6%) | 3.9 s (6%) | 5.3 s (9%) | 5.6 s (9%) |
| Rest of compositing (copy frame, mask, `destination-in`, draw) | 3.7 s (6%) | 8.2 s (12%) | about 0 | about 0 |
| Mask smoothing and upload | 0.26 s | 0.24 s | 0.18 s | 0.19 s |
| Draw decoded frame to canvas | 0.28 s | 0.44 s | under 0.02 s | under 0.02 s |
| Decode, encode, mux, per-frame yield (remainder) | 4.4 s (7%) | 8.7 s (12%) | 5.6 s (9%) | about 6 s (9%) |
| **Wall** | **61.4 s** | **70.3 s** | **61.1 s** | **63.7 s** |

Per frame: inference about 162 ms; blur about 13 ms (Chromium) to 18 ms (WebKit); everything else together
about 30 ms at 720p. Reading the mask back, downscaling the frame and smoothing the mask are each under 1 ms.

Decode and encode alone (the same transcode with the model and compositing switched off, `--skip`):
Chromium 2.3 s for 10 s at both sizes (14 s per video minute), WebKit 5.9 s at 720p and 6.4 s at 1080p (about 36 s per
video minute). So the fixed cost of "re-encode this video in the browser" is small; **the model is the problem**.

The Mac's hardware H.264 codecs are strong; on a phone the encode share will be larger than 7%, but the
model should still dominate. (Unmeasured on a phone.)

## 2. Speed-ups

All measured on the same Mac, Chromium and/or WebKit, 720p, 10 s clip, blur background. "Gain" is wall time against the baseline of 61 s.

| # | Option | Library / model | Licence | Download change | Measured result | Gain | Caveats |
|---|---|---|---|---|---|---|---|
| A | **Smaller model**: MediaPipe `selfie_segmenter` (256×256) or `selfie_segmenter_landscape` (144×256) in place of `selfie_multiclass_256x256` | `@mediapipe/tasks-vision` (already shipped), Google MediaPipe models | Apache-2.0 (model card) | 16.4 MB → 0.25 MB (the "about 28 MB" first-run figure shrinks by about 16 MB) | Inference 1.7 s (256×256) and 1.1 s (landscape) per 302 frames, against 48.9 s. Wall: Chromium 14.1 s and 13.7 s; WebKit 17.3 s and 13.2 s | **4.4× and 4.5× Chromium; 3.5× and 4.6× WebKit** | Binary model: its mask 0 is *person*, not background, so the polarity in `Matte.apply` flips (my run painted the person green until inverted). Hair and edge quality has not been compared on real footage; on one studio portrait the silhouette was clean but flatter at the hair. The multiclass model separates hair, face and clothes, which the code does not even use (only the background class). The landscape variant is made for 16:9 and may cut off a portrait video's sides: needs a check. |
| B | **Mask every Nth frame**, reuse (or blend) the previous mask in between | none (existing code) | n/a | none | N=2: 36.8 s; N=3: 28.6 s (Chromium) | **1.7×, 2.1×** | Edge lags fast movement; the existing temporal smoothing (`KEEP`) helps. The gain shrinks once the model is cheap (A). Interpolating between two masks costs about 1 ms per frame, not yet built. |
| C | **GPU delegate** (`delegate: 'GPU'`) | `@mediapipe/tasks-vision` (WebGL path), same model | Apache-2.0 | none | WebKit 720p: 21.6 s (first run; inference 9.0 s + mask read-back 1.5 s); WebKit 1080p: 16.4 s; with every 2nd frame: 13.8 s. Headed Chromium: 16.7 s (inference 6.1 s + read-back 3.4 s). Playwright's *headless* Chromium has no real GPU and took 130 s (read-back 118 s): this is a software path, so test on real hardware | **about 2.8 to 3.9×** on a Mac GPU | Not measured on a phone. WebGL on iOS has memory limits (the tool already has memory-abort handling); the GPU context is shared with the page. Needs feature detection and a silent fall back to the CPU delegate. Output equality with the CPU delegate was not compared. First-frame start-up is 3 to 9 s of shader set-up. |
| D | Smaller picture handed to the model (`WORK` 512 → 256) | none | n/a | none | 60.0 s against 61.4 s | **none (1.02×)** | The model resizes to 256×256 itself; lowering `WORK` only saves a few canvas ms. Not worth a change. |
| E | Cheaper compositing: blur at 320 px, one pass (copy + mask in one `drawImage`) | none | n/a | none | Not measured. Blur is 6 to 9% and the remaining compositing 6 to 12%, so the ceiling is about 10 to 15% | about 1.1× (estimate) | Safe, small, mostly helps 1080p. |
| F | Workers and pipelining: run the model in a Worker with `OffscreenCanvas` while the next frame decodes | existing | n/a | none | Not measured. Decode and encode already run off the main thread in WebCodecs. The only serial part left to overlap is the 7 to 12% remainder, so the ceiling is about 1.1× | about 1.1× (estimate); also stops the page freezing | The real gain is the UI staying responsive, and it combines with C. 2 to 3 days of work. |
| G | Heavier or different matting model: MODNet (ONNX, onnxruntime-web, already a dependency) | `onnxruntime-web` 1.30 (in repo), `Xenova/modnet` | Apache-2.0, about 26 MB fp32 | +26 MB | Not measured | not a speed-up; probably slower than A, possibly better edges | Listed so nobody re-researches it. |
| H | Robust Video Matting (the research standard) | ONNX / TF.js int8 | **GPL-3.0** | about 15 to 30 MB | Not measured | n/a | Licence is incompatible with this repo's MIT licence; ruled out. |

Frame count is the other multiplier: a 60 fps clip costs double a 30 fps clip with every option above. A
user who wants speed can be offered "process 30 frames per second" (drop alternate frames; the output
then plays at half the frame rate), but that changes the output, so it is a choice, not a default.

Combining: A alone gets a 30 fps video to about 0.9 to 1.2× its length on this Mac. A with B(2) or with C
is roughly 0.5×. After A, the floor is the blur plus compositing plus transcode (about 14 s per 10 s clip here),
and options E and F are what is left.

## 3. Stating the time

**Recommendation: yes.** Today the only feedback is a percentage (`Replacing the background of clip.mp4: 12%`)
and a FAQ answer ("it depends"). A 2-minute video that takes 5 to 10 minutes with no stated time reads as "stuck",
and users on phones will close the tab. Stating a time up front is cheap and nothing leaves the device.

How:

1. **Before running:** a dropped video's duration is known immediately (`videoSize` already reads it). Show a
   rough line under the button once the video is added, scaled by a *fixed per-build constant*
   (the current model: about 6× on a laptop, up to about 7× on a phone; set it from the measured number
   after each model change). Round up to a range: do not print a precise figure.
2. **While running:** after about 3 s of real work (about 15 frames after the model has started, so
   start-up is not counted), compute `elapsed / frames-done` and show "about N min left", re-computed
   every 5 s from a rolling window and rounded to 30 s (under 3 min) or whole minutes. Never show a time
   that goes up and down by more than a step; hold the previous value if the new one differs by under 10%.
   This copes with phones, thermal throttling and 60 fps clips that a fixed constant gets wrong.
3. **No benchmark upload.** The measurement is only local state. Do not add a `duration` or `fps` field to analytics
   without listing it on `/privacy` (analytics fields must match that page).
4. Keep the existing "keep this tab open" wording; add that the screen must stay on (the page already
   holds a wake lock: `keepAwake: true`).

Proposed copy (checked against the rules in `tests/claims.spec.ts`: none of the banned size, offline
or "nothing is sent" phrases; dynamic strings in scripts are not scanned, static ones below are):

- Under the button, after a video is added (static range, until the model is faster):
  `A 2:00 video usually takes 5 to 15 minutes here; a recent computer is quicker than a phone. The time left appears once it is running.`
  (Built from the duration × a constant; `usually` and `appears` keep it honest.)
- While running: `Replacing the background of clip.mp4: 12% · about 6 min left. Keep this tab open.`
- Before the first frame (model download): `Loading the person finder, once (about 28 MB)…` (as today; if option A ships, the download falls to about 12 MB and this copy must change).
- FAQ "How long does it take?" (static page text):
  `On a recent computer, plan on about 5 to 7 times the length of the video, so a 10-minute clip takes about an hour; phones are similar. Longer or higher-frame-rate videos take longer. The page shows the time left once it is running. Keep the tab open while it works.`
  Re-measure after any model change before publishing; with option A it becomes "about the length of the video".

If wording must avoid a precise multiple, the safe, true general form is:
`This runs on your own device, one frame at a time, so a long video takes a while: usually several times its length. A time estimate appears as soon as it starts.`

## Follow-up build tasks, ranked

| # | Task | Effort | Why / risk |
|---|---|---|---|
| 1 | **Swap to the binary selfie segmenter** (A): add `selfie_segmenter.tflite` and `selfie_segmenter_landscape.tflite` models to `public/models/`, flip mask polarity, pick landscape vs square by the video's aspect, run the side-by-side quality check on 5 or 6 real clips (glasses, hair, two people, fast hands, dark room, 9:16). Offer the old model as a "Better edges (slower)" option if quality is visibly worse. Update the licences page and README model notes, the "about 28 MB" copy, `engine.ts` text and the FAQs. | 1 to 1.5 days | 3.5 to 4.5× faster, 16 MB less first-run download. Biggest win by far. Risk: edge quality; mitigated by the toggle. |
| 2 | **Time-left readout** from measured first frames, plus the before-run line and the FAQ rewrite (section 3). Needs a Playwright check of the text and a claims.spec run. | 0.5 day | Fixes the "is it stuck" problem now, whatever the speed. Can ship before task 1. |
| 3 | **Every-Nth-frame masks with a blended mask** (B), as the "Faster" setting for long clips, default off for short ones. | 0.5 day | 1.7 to 2.1× on the current model; less useful after task 1. |
| 4 | **GPU delegate with feature detection and fallback** (C). Needs a real-iPhone and a real-Android check, memory-abort handling and a mask-equality test against the CPU path. | 1 to 2 days | 3 to 4× more on top, but an unverified risk on phones: do it after tasks 1 and 2 and only if phones are still slow. |
| 5 | **Cheaper compositing** (E): blur at 320 px, single-pass mask composite. | 0.25 day | About 10% at 1080p. |
| 6 | **Model in a Worker** (F), so the page stays responsive and the model overlaps decode and encode. | 2 to 3 days | Small speed gain, but the page stops freezing; also unlocks a cancel button that works at once. |
| 7 | **Re-measure on real phones**: run the bench page's hooks on one iPhone and one mid-range Android, with the real clip lengths and frame rates people use (30, 60 fps). | 0.5 day, needs a device | Replaces the estimated phone numbers above. |

## Limits of this study

- One Mac (M3 Max, other apps open), one run per cell, so ±15%. The 30 s Chromium run (356 s per minute)
  agrees with the 10 s runs (368 s per minute).
- The test clips are a photographed person on a test pattern, not real footage; inference time does not
  depend on content, but the *quality* comparison for option A does and is not done.
- No iOS Simulator run: it uses the same Mac CPU and the same WebKit engine, so it adds nothing over the WebKit
  Playwright numbers here; the only phone figure is the Oct 12 real-device estimate quoted above.
- Chromium numbers are from Playwright's headless shell, WebKit from Playwright's WebKit build (not Safari 26 proper).
  The GPU rows depend on the Mac's GPU and are not a phone figure.
- The binary-model runs timed inference and compositing with the person and background swapped (the mask
  polarity difference); the cost is identical, the picture was inverted.
