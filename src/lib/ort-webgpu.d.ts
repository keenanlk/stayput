/** onnxruntime-web's WebGPU build, aliased in astro.config.mjs. */
declare module 'ort-webgpu' {
  export * from 'onnxruntime-web';
}

/** A second copy of transformers.js, built over the WebGPU runtime; only the WebGPU speech worker loads it. */
declare module 'transformers-gpu' {
  export * from '@huggingface/transformers';
}
