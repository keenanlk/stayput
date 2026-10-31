/**
 * A 2D context for a canvas, or a named error when the browser will not give one. Safari caps the memory all canvases
 * together may hold (224 to 384 MB by device) and frees a dropped canvas late; past the cap getContext returns null.
 * The name is in the retry ladder's list (edit-recovery.ts), so the run starts again at a smaller size.
 */
import { NamedError } from './input-error';

export function context2d(canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new NamedError('CanvasMemoryError', "This device ran out of memory for drawing. Close other tabs and apps and try again, or use a shorter or smaller video.");
  return ctx;
}

/** Give a canvas's memory back now: setting a side to 0 frees the pixels, where a dropped canvas may be freed late. */
export function releaseCanvas(canvas: HTMLCanvasElement | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}
