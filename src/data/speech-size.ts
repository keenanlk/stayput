/**
 * What the speech model's files weigh, in MB, for each way it runs (see src/lib/speech-path.ts): the
 * 8-bit model every browser can run, and the 16-bit encoder plus the same 8-bit decoder that computers
 * with WebGPU use. Every page that states the download says both; tests/claims.spec.ts checks the text.
 */
export const SPEECH_MODEL_MB = { q8: 77, webgpu: 95, tiny: 41 } as const;

/** "77 MB, or 95 MB on computers with WebGPU". */
export const SPEECH_MODEL_SIZE = `${SPEECH_MODEL_MB.q8} MB, or ${SPEECH_MODEL_MB.webgpu} MB on computers with WebGPU`;

/**
 * What the smaller model's first use puts on the wire, in bytes, file by file: the two model files (served as they are),
 * the onnxruntime runtime, and the tokenizer and config files (the text ones travel brotli-compressed). Measured by
 * running a transcription with `?speechModel=tiny` and reading each response's transfer size.
 */
export const SPEECH_TINY_FIRST_USE_BYTES = {
  'onnx/encoder_model_quantized.onnx': 10_124_990,
  'onnx/decoder_model_merged_quantized.onnx': 30_719_241,
  'ort-wasm-simd-threaded.wasm': 3_324_243,
  'ort-wasm-simd-threaded.mjs': 9_486,
  'tokenizer.json': 653_537,
  'tokenizer_config.json': 6_172,
  'config.json': 874,
  'generation_config.json': 1_083,
  'preprocessor_config.json': 339,
} as const;

/** The smaller model's whole first-use download in MB, runtime and tokenizer included: 45, against 41 for the two model files alone. */
export const SPEECH_TINY_FIRST_USE_MB = Math.round(Object.values(SPEECH_TINY_FIRST_USE_BYTES).reduce((a, b) => a + b, 0) / 1e6);
