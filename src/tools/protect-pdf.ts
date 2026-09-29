import { createShell, str, processEach } from '../lib/shell';
import { unlockPdf, encryptPdf } from '../lib/unlock';
import type { OutputFile } from '../lib/files';

const fields = ['password', 'password-confirm'].map((id) => document.getElementById(id) as HTMLInputElement);
document.getElementById('show-password')?.addEventListener('change', (e) => {
  const show = (e.target as HTMLInputElement).checked;
  for (const f of fields) f.type = show ? 'text' : 'password';
});

createShell({
  async process(files, progress) {
    const password = str('password');
    if (!password) throw new Error('Enter a password to protect the PDF with.');
    if (password !== str('password-confirm')) throw new Error('The two passwords do not match. Type the same password in both boxes.');
    return processEach(files, progress, 'Protecting', async (entry) => {
      const src = new Uint8Array(await entry.file.arrayBuffer());
      // An already-encrypted file is opened first (asking for its old password if needed), then re-encrypted.
      const { bytes: plain } = await unlockPdf(src);
      const bytes = await encryptPdf(plain, password);
      const out: OutputFile = {
        name: entry.file.name,
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note: 'AES-256, password required to open',
      };
      return out;
    });
  },
});
