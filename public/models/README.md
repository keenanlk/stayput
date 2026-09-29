# Models

`blaze_face_short_range.tflite` is Google's MediaPipe BlazeFace short-range face
detector (float16), from
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
It is licensed under the Apache License 2.0 (see the MediaPipe model card).
The blur tool loads it only when someone presses "Find faces"; it runs in the
browser through @mediapipe/tasks-vision, served from /vendor/.

`isnet-general-use-uint8.onnx` is ISNet general-use from the DIS project
(https://github.com/xuebinqin/DIS), released under the Apache License 2.0. The
ONNX export is the one distributed by rembg
(https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx,
179 MB). Only its main output is kept, and its weights are dynamically quantised
to 8 bits with onnxruntime's `quantize_dynamic` (QUInt8), giving 46 MB. The
background remover loads it on the first photo and runs it in a web worker
through onnxruntime-web, served from /vendor/.

Files here are served with a one-year immutable cache and cached by the service
worker, so a changed model must get a new file name.
