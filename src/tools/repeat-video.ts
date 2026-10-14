import { bool, createShell, num, radio } from '../lib/shell';
import { suffixName, formatBytes, type OutputFile } from '../lib/files';
import { InputError } from '../lib/input-error';
import { isPhoneBrowser } from '../lib/phone-limit';
import { MAX_OUTPUT_BYTES, planLoop, type LoopMode } from '../lib/loop-plan';

/**
 * Repeat a video end to end. The packets are copied again and again where the
 * container can hold the clip's codecs, and re-encoded once otherwise (see
 * src/lib/video-loop.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

const mode = (): LoopMode => (radio('by', 'count') === 'length' ? 'length' : 'count');
const wanted = () => ({ mode: mode(), count: num('loop-count', 5), target: num('loop-minutes', 10) * 60, phone: isPhoneBrowser() });

/** The clip's length, read once per file and kept until another is dropped. */
let known: { file: File; duration: number } | undefined;

function syncFields() {
  const length = mode() === 'length';
  document.getElementById('loop-count-field')!.hidden = length;
  document.getElementById('loop-length-field')!.hidden = !length;
}

const shell = createShell({
  keepAwake: true,
  outputFormat: () => 'mp4',
  async onFilesChanged(files) {
    known = undefined;
    refresh();
    const file = files[0]?.file;
    if (!file) return;
    try {
      const { probeLoop } = await import('../lib/video-loop');
      const { duration } = await probeLoop(file);
      if (files[0]?.file === file) known = { file, duration };
    } catch {
      // The run itself says what is wrong with the file.
    }
    refresh();
  },
  async process(files, progress) {
    const entry = files[0];
    if (!entry) throw new InputError('Add a video to repeat.');
    const file = entry.file;
    // Refuse from the estimate before anything is read: the output is the clip's size times the repeats.
    const { probeLoop, loopVideo } = await import('../lib/video-loop');
    progress.set(`Reading ${file.name}…`, 0.01);
    const duration = known?.file === file ? known.duration : (await probeLoop(file)).duration;
    const plan = planLoop({ bytes: file.size, duration, ...wanted() });
    if (plan.refusal) throw new InputError(plan.refusal);
    const r = await loopVideo(file, {
      repeats: plan.repeats,
      mute: bool('mute'),
      onProgress: (f) => progress.set(`Repeating ${file.name}: ${Math.round(f * 100)}%`, 0.02 + f * 0.98),
    });
    const notes = [`${plan.repeats} repeats`, clock(r.duration), `${r.width}×${r.height}`, r.copied ? `${r.videoCodec} copied, no re-encoding` : `re-encoded to ${r.videoCodec}`];
    if (!r.audio) notes.push(r.audioDropped ? 'sound left out: this browser cannot encode it' : 'no sound');
    const out: OutputFile = { name: suffixName(file.name, `-x${plan.repeats}`, r.ext), blob: r.blob, originalSize: file.size, note: notes.join(', ') };
    return [out];
  },
  resultsTitle: () => 'Repeated video',
});

/** Say what the run will make, from the clip's size and length and the options now set. */
function refresh() {
  if (!known) {
    shell.setHint(`The file is built in memory, so it is limited to about ${formatBytes(MAX_OUTPUT_BYTES)} (about 200 MB on a phone). The estimate appears when you add a video.`);
    return;
  }
  const plan = planLoop({ bytes: known.file.size, duration: known.duration, ...wanted() });
  shell.setHint(
    plan.refusal
      ? plan.refusal
      : `${plan.repeats} repeats make a video about ${clock(plan.duration)} long and about ${formatBytes(plan.bytes)}.`,
  );
}

for (const id of ['loop-count', 'loop-minutes']) document.getElementById(id)?.addEventListener('input', refresh);
for (const el of document.querySelectorAll('input[name="by"]')) {
  el.addEventListener('change', () => {
    syncFields();
    refresh();
  });
}
syncFields();
refresh();
