import { bool, createShell } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { cropBox } from '../lib/crop-box';
import { describeEdit } from './video-edit-shell';

/**
 * Crop video. The first moments of the clip are shown on the crop stage (the
 * browser plays it from a blob: URL) so the box can be drawn; the crop itself
 * is done by src/lib/video-edit.ts, loaded on demand. Nothing leaves the tab.
 */

let url: string | undefined;

function unload() {
  if (url) URL.revokeObjectURL(url);
  url = undefined;
  cropBox.hide();
}

async function load(file: File) {
  unload();
  url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  await new Promise<void>((ok, bad) => {
    const timer = setTimeout(() => bad(new Error('Timed out opening the video.')), 20_000);
    v.onloadeddata = () => (clearTimeout(timer), ok());
    v.onerror = () => (clearTimeout(timer), bad(new Error('This browser cannot play this video. iPhone videos are often HEVC (H.265), which Chrome and Firefox on Windows or Linux cannot decode: try Safari.')));
    v.src = url!;
  });
  // A frame a little way in is more telling than a black first frame.
  const at = Number.isFinite(v.duration) ? Math.min(1, v.duration / 3) : 0;
  if (at > 0) {
    await new Promise<void>((ok) => {
      const timer = setTimeout(ok, 3000);
      v.onseeked = () => (clearTimeout(timer), ok());
      v.currentTime = at;
    });
  }
  cropBox.show(v, v.videoWidth, v.videoHeight);
}

const shell = createShell({
  async onFilesChanged(files) {
    if (files.length === 0) return unload();
    try {
      await load(files[0]!.file);
    } catch (e) {
      unload();
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!cropBox.size().width) await load(entry.file);
    const r = cropBox.rect();
    const { width, height } = cropBox.size();
    if (r.x === 0 && r.y === 0 && r.w === width && r.h === height) throw new Error('The crop box covers the whole video. Drag its edges or pick an aspect ratio first.');
    progress.set('Opening the video…', 0);
    const { editVideo } = await import('../lib/video-edit');
    const out = await editVideo(entry.file, {
      crop: { left: r.x, top: r.y, width: r.w, height: r.h },
      mute: bool('mute'),
      onProgress: (f) => progress.set(`Cropping ${entry.file.name}: ${Math.round(f * 100)}%`, f),
    });
    const file: OutputFile = { name: suffixName(entry.file.name, '-cropped', out.ext), blob: out.blob, originalSize: entry.file.size, note: describeEdit(out) };
    return [file];
  },
});
