import { bool, createShell, processEach, str } from '../lib/shell';
import { formatBytes, suffixName, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { convertAudio, type AudioFormat } from '../lib/audio-convert';
import { bitrateToFit } from '../lib/audio-fit';

createShell({
  outputFormat: () => str('format', 'mp3'),
  async process(files, progress) {
    const fmt = str('format', 'mp3') as AudioFormat;
    const quality = Number(str('quality', '128'));
    const fit = str('fit', 'none');
    const limit = fit === 'none' ? null : Number(fit);
    const mono = bool('mono');
    return processEach(files, progress, 'Compressing', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${file.name}…`, share(0.05));
      let kbps = quality;
      const r = await convertAudio(file, fmt, {
        bitrate: quality,
        mono,
        transform: (chans, rate) => {
          kbps = bitrateToFit(quality, chans[0]!.length / rate, limit);
          return chans;
        },
        bitrateOf: () => kbps,
        onProgress: (f) => progress.set(`Compressing ${file.name}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.9)),
      });
      const detail = `${formatDuration(r.duration)}, ${kbps} kbps ${fmt === 'ogg' ? 'Opus' : 'MP3'}${r.channels === 1 ? ', mono' : ''}`;
      if (r.blob.size >= file.size) {
        // Already smaller than this setting would make it: hand the original back.
        const out: OutputFile = { name: file.name, blob: file, originalSize: file.size, note: `already smaller than ${kbps} kbps would make it, kept as it was` };
        return out;
      }
      const missed = limit && r.blob.size > limit * 1_000_000 ? `, still over ${limit} MB (${formatBytes(r.blob.size)}): trim it or choose mono` : '';
      const out: OutputFile = { name: suffixName(file.name, '-compressed', fmt), blob: r.blob, originalSize: file.size, note: detail + missed };
      return out;
    });
  },
});
