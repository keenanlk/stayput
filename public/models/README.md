# Models

`blaze_face_short_range.tflite` is Google's MediaPipe BlazeFace short-range face
detector (float16), from
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
It is licensed under the Apache License 2.0 (see the MediaPipe model card).
The blur tool loads it only when someone presses "Find faces"; it runs in the
browser through @mediapipe/tasks-vision, served from /vendor/.
