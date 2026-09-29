import { createShell, str, processEach } from '../lib/shell';
import { unlockPdf, looksEncrypted } from '../lib/unlock';
import type { OutputFile } from '../lib/files';

createShell({
  async process(files, progress) {
    const typed = str('password').trim();
    return processEach(files, progress, 'Unlocking', async (entry) => {
      const src = new Uint8Array(await entry.file.arrayBuffer());
      let note: string;
      let bytes: Uint8Array<ArrayBufferLike> = src;
      if (!looksEncrypted(src)) {
        note = 'had no password, saved as is';
      } else {
        let neededPassword = false;
        const result = await unlockPdf(src, {
          // The typed password first; after a wrong one, ask in a prompt.
          askPassword: (attempt) => {
            neededPassword = true;
            if (attempt === 0 && typed) return typed;
            const text = typed || attempt > 0 ? `That password did not open ${entry.file.name}. Try again:` : `${entry.file.name} needs its password to open. Enter it here (it is checked in your browser and never sent anywhere).`;
            return window.prompt(text, '')?.trim() || undefined;
          },
        });
        bytes = result.bytes;
        note = neededPassword ? 'password removed' : 'restrictions removed';
      }
      const out: OutputFile = {
        name: entry.file.name,
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note,
      };
      return out;
    });
  },
});
