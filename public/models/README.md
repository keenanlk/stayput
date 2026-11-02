# Models

`blaze_face_short_range.tflite` is Google's MediaPipe BlazeFace short-range face
detector (float16), from
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
It is licensed under the Apache License 2.0 (see the MediaPipe model card).
The blur tool loads it only when someone presses "Find faces"; it runs in the
browser through @mediapipe/tasks-vision, served from /vendor/.

`isnet-general-use-int8w.onnx` is ISNet general-use from the DIS project
(https://github.com/xuebinqin/DIS). The DIS README licenses its code and
evaluation metric under the Apache License 2.0 and names no licence for the
weights. The model was trained on the DIS5K dataset, whose terms of use
restrict it to non-commercial research and educational use. The
ONNX export is the one distributed by rembg
(https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx,
179 MB). Only its main output is kept. The convolution weights are stored as
8-bit integers, one scale per output channel, each followed by a
DequantizeLinear node, so the file is 46 MB but the model still computes in
32-bit float. (An earlier build used onnxruntime's `quantize_dynamic`, which
also quantises activations; it left speckles on textured backgrounds.) The
background remover loads it on the first photo and runs it in a web worker
through onnxruntime-web, served from /vendor/.

`whisper-base/` is OpenAI's Whisper base speech-recognition model
(https://github.com/openai/whisper), released under the MIT License, as the
ONNX export published by onnx-community on Hugging Face
(https://huggingface.co/onnx-community/whisper-base). The 8-bit quantised
encoder and merged decoder are kept, with the tokenizer and config files, 77 MB
in all, and the 16-bit encoder (`encoder_model_fp16.onnx`, 41 MB, SHA-256
ffba51b20185377c1b89362b1128148d0132de936a32b200af973da2a11a5369) that
computers with WebGPU run on the graphics chip instead of the 8-bit one,
combined with the same 8-bit decoder. The transcribe tool loads it on the first file and runs it in a web
worker through Transformers.js (Apache-2.0) and onnxruntime-web, served from
/vendor/.

`uvr-mdx-net-inst-hq-3.onnx` is UVR-MDX-NET-Inst_HQ_3, an MDX-Net
instrumental model released by the Ultimate Vocal Remover project
(https://github.com/Anjok07/ultimatevocalremovergui, MIT License) and
distributed through its model repository; this copy is the unmodified 67 MB
ONNX file as mirrored at
https://huggingface.co/spaces/next-playground/Ultimate-Vocal-Remover-WebUI.
It reads a [1, 4, 3072, 256] spectrogram (n_fft 6144, hop 1024) and predicts
the instrumental; UVR scales that by 1.022. The vocal remover loads it on the
first song and runs it in a web worker through onnxruntime-web, on WebGPU
when the browser has it and WebAssembly otherwise, both served from /vendor/.

`nmp.onnx` is Basic Pitch, Spotify's note-transcription model (ICASSP 2022),
released by Spotify AB (https://github.com/spotify/basic-pitch, Apache License
2.0). It is the unmodified file as published at
https://github.com/spotify/basic-pitch/blob/dfb20ef559dff1792e11e022f3f0c7008c1dee6d/basic_pitch/saved_models/icassp_2022/nmp.onnx
(repository path `basic_pitch/saved_models/icassp_2022/nmp.onnx`, commit
dfb20ef559dff1792e11e022f3f0c7008c1dee6d), 230,444 bytes, SHA-256
2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec. It reads
43,844 samples of 22,050 Hz mono audio and returns, per 2-second window, 172
frames of contour (264), note (88) and onset (88) activations. The MP3 to MIDI
tool loads it on the first file and runs it in a web worker through
onnxruntime-web on WebAssembly (the CPU), served from /vendor/.

`selfie_segmenter.tflite` and `selfie_segmenter_landscape.tflite` are Google's
MediaPipe selfie segmenter (binary person mask, float16, 0.25 MB each, Apache
License 2.0; see the MediaPipe image segmenter model card), from
https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
and
https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite
(SHA-256
191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b and
490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e). The first takes 256 × 256 pictures and
serves portrait and square video; the landscape one takes 256 × 144 and serves
video that is 3:2 or wider. The video background remover loads one of them on
the first video and runs it through @mediapipe/tasks-vision, served from
/vendor/. Its confidence mask 0 is the person (the multiclass model's is the
background).

`selfie_multiclass_256x256.tflite` is Google's MediaPipe selfie multiclass
segmenter (float32, 16 MB, Apache License 2.0; see the MediaPipe image
segmenter model card), from
https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
The video background remover loads it only when "Better edges (slower)" is
chosen, and runs it through @mediapipe/tasks-vision, served from /vendor/; only
its background channel is used.

Files here are served with a one-year immutable cache and cached by the service
worker, so a changed model must get a new file name.

`realesr-general-x4v3.onnx` is Real-ESRGAN general x4v3 (SRVGGNetCompact, 1.2M
parameters) by Xintao Wang and others, released under the BSD 3-Clause
License (https://github.com/xinntao/Real-ESRGAN). It was exported to ONNX
(opset 17, float32, dynamic height and width) from the official weights,
https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
(SHA-256 8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292),
and checked against the PyTorch model (largest difference under 1e-6). The
image upscaler loads it on the first picture and runs it in a web worker
through onnxruntime-web, served from /vendor/.

`migan-pipeline-v2.onnx` is MI-GAN (Sargsyan et al., ICCV 2023) by Picsart AI
Research, released under the MIT License
(https://github.com/Picsart-AI-Research/MI-GAN). The file is the authors'
ONNX pipeline export, unchanged, from
https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx
(28,079,181 bytes, SHA-256
6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b). It takes the
picture and a mask as 8-bit pixels, crops around the masked area, fills it at
512 × 512 and blends the fill back at full size. The object remover loads it on
the first erase and runs it in a web worker through onnxruntime-web, served
from /vendor/.

`whisper-tiny/` is OpenAI's Whisper tiny speech-recognition model, released
under the MIT License, as the ONNX export published by onnx-community on
Hugging Face (https://huggingface.co/onnx-community/whisper-tiny, revision
ff4177021cc41f7db950912b73ea4fdf7d01d8e7). Only the 8-bit quantised encoder
and merged decoder are kept, with the tokenizer and config files, 41 MB in
all. Phones that ran out of memory with the base model (and phones known to be
short of it) load this one instead; it is less accurate.

## How the page checks these files

`npm run build` runs `scripts/model-manifest.mjs`, which writes `src/data/model-manifest.json`: the size and
SHA-256 of every file here, keyed by the path it is served at. The speech, person-finder, face-finder and
vocal-remover loaders (`src/lib/model-fetch.ts`) compare a download, and a copy kept in the Cache API, with it
before using it, so replacing a model means rebuilding (the manifest is committed, and `node
scripts/model-manifest.mjs --check` fails when it is out of date).

Hosting note: Cloudflare allows 25 MiB per static asset. `scripts/cloudflare-assets.mjs` finds the files over that
in `dist/` and they are served from R2 by the Worker in `worker/`, at these same URLs. A new file over the limit fails
that script until `wrangler.jsonc` routes it (`node scripts/cloudflare-assets.mjs --write-config`). See
`docs/cloudflare-cutover.md`.
