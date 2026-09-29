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

Files here are served with a one-year immutable cache and cached by the service
worker, so a changed model must get a new file name.
