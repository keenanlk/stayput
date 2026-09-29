# Models

`blaze_face_short_range.tflite` is Google's MediaPipe BlazeFace short-range face
detector (float16), from
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
It is licensed under the Apache License 2.0 (see the MediaPipe model card).
The blur tool loads it only when someone presses "Find faces"; it runs in the
browser through @mediapipe/tasks-vision, served from /vendor/.

`isnet-general-use-int8w.onnx` is ISNet general-use from the DIS project
(https://github.com/xuebinqin/DIS), released under the Apache License 2.0. The
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
(https://huggingface.co/onnx-community/whisper-base). Only the 8-bit quantised
encoder and merged decoder are kept, with the tokenizer and config files, 76 MB
in all. The transcribe tool loads it on the first file and runs it in a web
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

`selfie_multiclass_256x256.tflite` is Google's MediaPipe selfie multiclass
segmenter (float32, Apache License 2.0; see the MediaPipe image segmenter
model card), from
https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
The video background remover loads it on the first video and runs it through
@mediapipe/tasks-vision, served from /vendor/; only its background channel is used.

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
