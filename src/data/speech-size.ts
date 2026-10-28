/**
 * What the speech model's files weigh, in MB, for each way it runs (see src/lib/speech-path.ts): the
 * 8-bit model every browser can run, and the 16-bit encoder plus the same 8-bit decoder that computers
 * with WebGPU use. Every page that states the download says both; tests/claims.spec.ts checks the text.
 */
export const SPEECH_MODEL_MB = { q8: 77, webgpu: 95, tiny: 41 } as const;

/** "77 MB, or 95 MB on computers with WebGPU". */
export const SPEECH_MODEL_SIZE = `${SPEECH_MODEL_MB.q8} MB, or ${SPEECH_MODEL_MB.webgpu} MB on computers with WebGPU`;
