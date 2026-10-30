/**
 * What a canvas can be on this device. Safari on iPhone and iPad capped one canvas at 16.7 million pixels until iOS 17
 * and still loses tabs to big ones, so a picture over that is drawn smaller there. Everywhere else the size is tried:
 * a canvas the browser cannot allocate has no 2d context, or reads back blank.
 */
import { isIosBrowser } from './phone-limit';

/** Pixels in the largest canvas Safari on iOS reliably draws (4096 × 4096). */
export const IOS_CANVAS_PIXELS = 4096 * 4096;

/** Whether a canvas of this size can be drawn into and read back. */
export function canvasWorks(width: number, height: number): boolean {
  if (isIosBrowser() && width * height > IOS_CANVAS_PIXELS) return false;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  let ok = false;
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(width - 1, height - 1, 1, 1);
    ok = ctx.getImageData(width - 1, height - 1, 1, 1).data[3] === 255;
  }
  // Release the pixels now, not when the garbage collector gets to it.
  c.width = c.height = 0;
  return ok;
}

/** The size to draw a width × height picture at: itself when that works, else the largest same-shaped size that does, or null when none does. */
export function fitCanvas(width: number, height: number): { width: number; height: number } | null {
  let w = width;
  let h = height;
  const cap = isIosBrowser() ? Math.sqrt(IOS_CANVAS_PIXELS / (width * height)) : 1;
  let scale = Math.min(1, cap);
  for (let i = 0; i < 12; i++) {
    w = Math.max(1, Math.floor(width * scale));
    h = Math.max(1, Math.floor(height * scale));
    if (canvasWorks(w, h)) return { width: w, height: h };
    scale *= 0.85;
  }
  return null;
}
