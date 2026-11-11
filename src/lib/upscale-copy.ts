/**
 * The sentences the AI upscaler adds to the shared model, worker and light-run wording (model-fetch.ts, model-stall.ts, light-copy.ts).
 * DRAFT: the final text comes from Marketing and replaces these in this one file. Every other message the upscaler can show is an
 * existing one (the model download classes, the read-failure causes, the decode causes).
 */
import { NamedError } from './input-error';

export const UPSCALE_COPY = {
  /** WorkerCrashError: the upscaler's worker stopped twice, the second time on a fresh worker. */
  crash: 'The upscaler stopped unexpectedly, which usually means the browser ran short of memory. Close other tabs and try again, or use a smaller picture or a smaller scale.',
  /** OutOfMemoryError: the picture did not fit, even at the smaller size. */
  memory: 'This device ran out of memory upscaling this picture, even at a smaller size. Close other tabs and apps and try again, use a smaller picture, or use a computer.',
  /** UpscaleDrawFailed: the picture could not be drawn at the size the network reads. */
  draw: 'The picture could not be prepared for upscaling. Try a smaller copy of it, or another browser.',
  /** UpscaleRunFailed: the network failed on a tile that was not a memory problem. */
  run: 'The upscaler failed part-way through this picture. Reload the page and try again, or try a smaller picture.',
  /** UpscaleComposeFailed: the upscaled pixels could not be put together into the finished picture. */
  compose: 'The upscaled picture could not be put together. Try a smaller scale or a smaller picture, or use another browser.',
  /** UpscaleSaveFailed: the finished picture could not be saved in the chosen format. */
  save: (format: string) => `This browser could not save the upscaled picture as ${format}. Try another format, a smaller scale, or another browser.`,
  /** Result note: this device started with a smaller size than was asked. */
  smallerDevice: (made: string) => `made at ${made}, a smaller size than asked, because this device may run low on memory`,
  /** Result note: the first try ran out of memory, so the picture was made again at a smaller size. */
  smallerMemory: (made: string) => `made at ${made}, a smaller size than asked, because the first try ran out of memory`,
} as const;

export const crashError = (cause?: unknown) => new NamedError('WorkerCrashError', UPSCALE_COPY.crash, { cause });
export const memoryError = (cause?: unknown) => new NamedError('OutOfMemoryError', UPSCALE_COPY.memory, { cause });
