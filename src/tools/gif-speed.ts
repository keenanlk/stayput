import { bool, createShell, num, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { DamagedGif, UnreadableFile, checkGif, explain } from '../lib/gif-errors';

/**
 * GIF speed and reverse. Each GIF is decoded, re-timed and rewritten in the page (see
 * src/lib/gif-compress.ts); nothing leaves the tab.
 */

createShell({
  outputFormat: () => 'gif',
  async process(files, progress) {
    const speed = Number(str('speed', '2'));
    const reverse = bool('reverse');
    const pingPong = bool('pingpong');
    const mode = str('loops', 'keep');
    // N plays in total is a count of N - 1 repeats after the first; once is no block at all.
    const times = Math.min(100, Math.max(1, Math.round(num('loop-times', 3))));
    const loops = mode === 'forever' ? 0 : mode === 'times' ? (times > 1 ? times - 1 : null) : mode === 'once' ? null : undefined;
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    return processEach(files, progress, 'Changing', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      const bytes = new Uint8Array(buffer);
      checkGif(
        bytes,
        () => {
          try {
            return gifFrameCount(buffer);
          } catch {
            throw new DamagedGif();
          }
        },
        1,
        1,
      );
      const r = await compressGif(buffer, {
        level: 'light',
        scale: 1,
        keepEvery: 1,
        speed,
        reverse,
        pingPong,
        loops,
        force: true,
        onProgress: (f) => progress.set(`Changing ${entry.file.name}: ${Math.round(f * 100)}%`, share(f)),
      }).catch((e) => {
        throw explain(e);
      });
      const blob = new Blob([r.bytes], { type: 'image/gif' });
      let previewUrl: string | undefined;
      try {
        const bitmap = await createImageBitmap(blob);
        previewUrl = await thumbnail(bitmap);
        bitmap.close();
      } catch {
        // A preview is a nicety; the file itself is fine.
      }
      const notes: string[] = [];
      if (reverse) notes.push('backwards');
      if (pingPong) notes.push('forward and back');
      if (mode === 'forever') notes.push('loops forever');
      else if (mode === 'once' || (mode === 'times' && times === 1)) notes.push('plays once');
      else if (mode === 'times') notes.push(`plays ${times} times`);
      if (speed !== 1) notes.push(`${speed}× speed`);
      notes.push(`${r.framesOut} frames`);
      const loopTag = mode === 'forever' ? 'looped' : mode === 'once' ? 'once' : mode === 'times' ? `${times}x-loop` : '';
      const tag = [reverse ? 'reversed' : '', pingPong ? 'pingpong' : '', loopTag, speed !== 1 ? `${String(speed).replace('.', '_')}x` : ''].filter(Boolean).join('-') || 'copy';
      const out: OutputFile = {
        name: suffixName(entry.file.name, `-${tag}`, 'gif'),
        blob,
        originalSize: entry.file.size,
        previewUrl,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
