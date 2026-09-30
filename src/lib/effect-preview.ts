import { decodeImage } from './image';
import type { ShellFile } from './shell';

type Canvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Keep the stage above the options showing the first image with the current
 * settings. `render` gets the bitmap and the longest side to draw at; the
 * preview redraws whenever an option changes. Returns the shell's
 * onFilesChanged handler.
 */
export function effectPreview(render: (bitmap: ImageBitmap, maxSide: number) => Canvas | Promise<Canvas>, hint: (count: number) => string, onError: (message: string) => void) {
  const panel = document.getElementById('fx-panel')!;
  const canvas = document.getElementById('fx-canvas') as HTMLCanvasElement;
  const hintEl = document.getElementById('fx-hint')!;
  let preview: ImageBitmap | undefined;
  let count = 0;
  let pending = 0;
  const redraw = async () => {
    if (!preview) return;
    const ticket = ++pending;
    const c = await render(preview, 900);
    if (ticket !== pending) return;
    canvas.width = c.width;
    canvas.height = c.height;
    canvas.getContext('2d')!.drawImage(c, 0, 0);
    hintEl.textContent = hint(count);
  };
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#options input, #options select')) {
    el.addEventListener(el instanceof HTMLInputElement && el.type === 'range' ? 'input' : 'change', () => void redraw());
    if (el instanceof HTMLInputElement && el.type === 'color') el.addEventListener('input', () => void redraw());
  }
  return async (files: ShellFile[]) => {
    count = files.length;
    preview?.close();
    preview = undefined;
    if (files.length === 0) {
      panel.hidden = true;
      return;
    }
    try {
      preview = (await decodeImage(files[0]!.file)).bitmap;
      panel.hidden = false;
      await redraw();
    } catch (e) {
      panel.hidden = true;
      onError(e instanceof Error ? e.message : String(e));
    }
  };
}
