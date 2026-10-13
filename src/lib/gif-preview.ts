import { DamagedGif, GifTooLarge, checkGif, explain, gifSize } from './gif-errors';

/** The first frame, drawn at the GIF's logical screen size (the size in its header). */
export async function firstFrame(buffer: ArrayBuffer, bytes: Uint8Array): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  checkGif(bytes, undefined, 1, 1);
  const size = gifSize(bytes)!;
  if (!size.width || !size.height) throw new DamagedGif();
  try {
    const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/gif' }));
    // Positions are in logical-screen pixels: a picture of another size would shift them.
    if (bitmap.width === size.width && bitmap.height === size.height) return { source: bitmap, width: size.width, height: size.height };
    bitmap.close();
  } catch {
    // Fall through to drawing the frame ourselves.
  }
  const { firstFrameCanvas } = await import('./gif-compress');
  try {
    return { source: firstFrameCanvas(buffer), width: size.width, height: size.height };
  } catch (e) {
    const known = explain(e);
    throw known instanceof GifTooLarge || known instanceof DamagedGif ? known : new DamagedGif();
  }
}
