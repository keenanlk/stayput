import { bool, createShell, str, type ShellFile } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { InputError, UnreadableFile } from '../lib/input-error';

/**
 * Add audio to video. The picture is copied as it is and the new sound is
 * encoded in the page (see src/lib/video-audio.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

/** Whether each dropped file holds a picture; undefined while it is being checked or could not be read (the run then names the problem). */
const hasPicture = new WeakMap<File, boolean | undefined>();

/** Why Run can't start yet, in one line; '' when there is one video and one sound file. */
function missing(files: ShellFile[]): string {
  if (files.length === 0) return 'Add one video and one sound file to start.';
  if (files.length > 2) return `Remove ${files.length - 2} file${files.length === 3 ? '' : 's'}: this tool takes one video and one sound file.`;
  const kinds = files.map((f) => (hasPicture.has(f.file) ? hasPicture.get(f.file) : undefined));
  if (files.length === 1) {
    if (!hasPicture.has(files[0]!.file)) return 'Checking the file…';
    return kinds[0] === false ? 'Add a video too: this one is only sound.' : kinds[0] === true ? 'Add a sound file too (MP3, WAV, M4A, or another video to take the sound from).' : '';
  }
  if (files.some((f) => !hasPicture.has(f.file))) return 'Checking the files…';
  return kinds.every((k) => k === false) ? 'Add a video: both of these files are only sound.' : '';
}

const shell = createShell({
  keepAwake: true,
  outputFormat: () => 'mp4',
  runBlocker: missing,
  async onFilesChanged(files) {
    const { hasVideo } = await import('../lib/video-audio');
    if (files.length <= 2) {
      await Promise.all(
        files.map(async ({ file }) => {
          if (hasPicture.has(file)) return;
          hasPicture.set(file, await hasVideo(file).catch(() => undefined));
        }),
      );
    }
    shell.refresh();
  },
  async process(files, progress) {
    if (files.length === 1) {
      // Say which one is missing: a picture means the sound file is the one to add.
      const { hasVideo } = await import('../lib/video-audio');
      if (await hasVideo(files[0]!.file)) throw new InputError('Add a sound file too: this tool needs one video and one audio file (MP3, WAV, M4A, or another video to take the sound from).');
      throw new InputError('Add a video too: this tool needs one video and one audio file, and this one is only sound.');
    }
    if (files.length !== 2) throw new InputError('Add one video and one sound file (MP3, WAV, M4A, or another video to take the sound from).');
    const { addAudio, hasVideo } = await import('../lib/video-audio');
    progress.set('Reading the files…', 0.01);
    const withPicture = await Promise.all(files.map((f) => hasVideo(f.file)));
    // The first file with a picture is the video; the other one gives the sound.
    const vi = withPicture.indexOf(true);
    if (vi < 0) throw new UnreadableFile('Neither file is a video this page can read (MP4, MOV, WebM or MKV).');
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
