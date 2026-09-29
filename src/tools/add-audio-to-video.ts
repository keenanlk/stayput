import { bool, createShell, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * Add audio to video. The picture is copied as it is and the new sound is
 * encoded in the page (see src/lib/video-audio.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    if (files.length !== 2) throw new Error('Add one video and one sound file (MP3, WAV, M4A, or another video to take the sound from).');
    const { addAudio, hasVideo } = await import('../lib/video-audio');
    progress.set('Reading the files…', 0.01);
    const withPicture = await Promise.all(files.map((f) => hasVideo(f.file)));
    // The first file with a picture is the video; the other one gives the sound.
    const vi = withPicture.indexOf(true);
    if (vi < 0) throw new Error('Neither file is a video this page can read (MP4, MOV, WebM or MKV).');
    const videoFile = files[vi]!.file;
    const soundFile = files[1 - vi]!.file;
    const mode = str('mode', 'replace') === 'mix' ? 'mix' : 'replace';
    const r = await addAudio(videoFile, soundFile, {
      mode,
      loop: bool('loop'),
      fade: bool('fade'),
      onProgress: (f) => progress.set(`Adding ${soundFile.name} to ${videoFile.name}: ${Math.round(f * 100)}%`, 0.02 + f * 0.98),
    });
    const notes = [mode === 'mix' ? `mixed in ${soundFile.name}` : `sound from ${soundFile.name}`, clock(r.duration), `${r.videoCodec} copied`];
    if (r.looped) notes.push(`sound looped (${clock(r.soundLength)} long)`);
    else if (r.cut) notes.push(`sound cut to fit`);
    else if (r.soundLength < r.duration - 0.5) notes.push(`silent after ${clock(r.soundLength)}`);
    const out: OutputFile = {
      name: suffixName(videoFile.name, '-with-audio', r.ext),
      blob: r.blob,
      originalSize: videoFile.size,
      note: notes.join(', '),
    };
    return [out];
  },
  resultsTitle: () => 'Sound added',
});
