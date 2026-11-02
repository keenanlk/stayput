import { bindRange, createShell, num, radio, str, type Progress, type ShellFile } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { EncoderUnavailable, hasVideoEncoder, requireH264Encoder } from '../lib/encoder-probe';
import { describeEdit } from './video-edit-shell';
import { resumeWhenHidden, retryNote } from '../lib/edit-recovery';
import { pageRecoveryHooks } from '../lib/recovery-hooks';
import { NamedError, UnreadableFile, UnsupportedCodec, isUnspecific } from '../lib/input-error';
import { snapshotFile } from '../lib/read-failure';
import { saveHandoff } from '../lib/handoff';
import { nameBare } from '../lib/bare-error';
import { lazyImport, warm } from '../lib/lazy-import';
import { context2d, releaseCanvas } from '../lib/canvas-memory';
import { blur as boxBlur } from '../lib/blur';
import { TimeLeft } from '../lib/time-left';
import { isPhoneBrowser, PHONE_SAFE_BYTES } from '../lib/phone-limit';
import { noteRunDetail } from '../lib/inflight';

/**
 * Video background remover: the people in each frame are found by MediaPipe's
 * selfie segmenter (src/lib/person-mask.ts) and everything else is blurred or
 * replaced with a colour or a picture, then the video is encoded again
 * (src/lib/video-edit.ts). Nothing leaves the tab.
 */

type Kind = 'blur' | 'color' | 'image';
// HEIC/HEIF counts: the Files app and a drag hand one over, often with an empty type, and it is a picture, not a video.
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif)$/i.test(f.name);

const kind = () => radio('bg', 'blur') as Kind;
const finder = () => radio('finder', 'edges') as 'fast' | 'edges';
const sync = () => {
  document.getElementById('strength-field')!.hidden = kind() !== 'blur';
  document.getElementById('color-field')!.hidden = kind() !== 'color';
  document.getElementById('image-hint')!.hidden = kind() !== 'image';
};
// A change of background also re-checks Run (pictureBlocker); `shell` exists by the time anyone can change it, though not when sync() first runs.
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="bg"]')) r.addEventListener('change', () => (sync(), shell.refresh()));
bindRange('strength', 'strength-out');
sync();

/**
 * On a phone Fast is preselected: runs on a phone were often left before they finished. It is set once,
 * as the page opens, so whatever the person picks afterwards stands. A computer keeps Better edges.
 */
if (isPhoneBrowser()) {
  const fast = document.querySelector<HTMLInputElement>('input[name="finder"][value="fast"]');
  if (fast) fast.checked = true;
  const note = document.getElementById('phone-fast-note');
  if (note) note.hidden = false;
}

/** Longest side the blurred background is made at; it is scaled up afterwards, which also softens it. */
const BLUR_WORK = 480;

/**
 * Draw the frame blurred over the whole canvas. Done by hand on a small copy, not with the canvas `filter` property:
 * Safari has no such property, and there the "blur" was a no-op that left the whole background sharp.
 * `seen` is the 512-pixel copy the person finder looked at: blurring that, not the full-size frame, saves reading a
 * 4K frame back for every frame (9 ms a frame in the iOS Simulator), and a heavy blur shows no difference.
 */
function drawBlurred(ctx: CanvasRenderingContext2D, seen: HTMLCanvasElement, small: HTMLCanvasElement, strength: number) {
  const { width, height } = ctx.canvas;
  // Same strength as before: a Gaussian of about min side x strength / 250 pixels, here measured on the small copy.
  const k = Math.min(1, BLUR_WORK / Math.max(width, height));
  small.width = Math.max(2, Math.round(width * k));
  small.height = Math.max(2, Math.round(height * k));
  const sctx = context2d(small, { willReadFrequently: true });
  sctx.drawImage(seen, 0, 0, small.width, small.height);
  const sigma = Math.max(2, (Math.min(width, height) * strength) / 250) * k;
  // boxBlur's radius is twice the Gaussian's spread; it reads clamped edges, so no dark border is pulled in.
  boxBlur(sctx, { x: 0, y: 0, w: small.width, h: small.height }, Math.max(2, Math.round(sigma * 2)));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, width, height);
}

/** Draw `img` to cover the whole canvas, cropping what does not fit. */
function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap) {
  const { width, height } = ctx.canvas;
  const k = Math.max(width / img.width, height / img.height);
  const w = img.width * k;
  const h = img.height * k;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

/** Where a frame's time went, for the result line: the person and background, against waiting on decode and encode. */
function frameSplit(t: { frames: number; paintMs: number; loopMs: number } | undefined): string {
  if (!t || t.frames < 10) return '';
  const paint = Math.round(t.paintMs / t.frames);
  const wait = Math.max(0, Math.round((t.loopMs - t.paintMs) / t.frames));
  return ` Each frame took about ${paint} ms to find the person and draw the background, and ${wait} ms more waiting for the picture to be decoded and the result encoded.`;
}

/** Fast finds nobody in dim light; a run that found no one says so and points at Better edges instead of returning an untouched picture. */
const lowLightMessage = (name: string) =>
  `The Fast person finder found no one in ${name}. This often happens in dim light. Choose Better edges under Person finder and run again.`;

/** Longest side of a clip a phone handles comfortably: 1080p. Bigger ones are slow and more likely to run out of memory. */
const PHONE_SAFE_SIDE = 1920;
const phoneNote = document.getElementById('phone-note');
const sizeNote = document.getElementById('size-note');
let phoneCheck = 0;

/** The 1080p output is preselected on a phone for a bigger clip, unless the person has chosen a size themselves. */
let sizeChosen = false;
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="size"]')) r.addEventListener('change', () => (sizeChosen = true));

/** The output's size for a source: 1080p caps the longest side at 1920, and never makes a picture bigger. */
function outputSize(source: { width: number; height: number }): { width?: number; height?: number } {
  if (radio('size', 'full') !== 'hd') return {};
  const longest = Math.max(source.width, source.height);
  if (longest <= PHONE_SAFE_SIDE) return {};
  const k = PHONE_SAFE_SIDE / longest;
  return { width: Math.round(source.width * k), height: Math.round(source.height * k) };
}

/** On a phone, a long or 4K clip gets a one-line suggestion, and 1080p output is preselected for a 4K one. Never blocks the run. */
async function checkPhoneClip(files: { file: File }[]) {
  if (!phoneNote) return;
  const mine = ++phoneCheck;
  phoneNote.hidden = true;
  if (sizeNote) sizeNote.hidden = true;
  if (!isPhoneBrowser()) return;
  const videos = files.map((f) => f.file).filter((f) => !isImage(f));
  let heavy = videos.some((f) => f.size > PHONE_SAFE_BYTES);
  let tall = false;
  if (videos.length > 0) {
    const { videoSize } = await lazyImport(() => import('../lib/video-edit'));
    for (const f of videos) {
      const s = await videoSize(f).catch(() => undefined);
      if (s && Math.max(s.width, s.height) > PHONE_SAFE_SIDE) tall = true;
    }
  }
  if (mine !== phoneCheck) return;
  if (tall && !sizeChosen) {
    const hd = document.querySelector<HTMLInputElement>('input[name="size"][value="hd"]');
    if (hd) hd.checked = true;
  }
  const hdOn = tall && radio('size', 'full') === 'hd';
  if (sizeNote) sizeNote.hidden = !hdOn;
  phoneNote.hidden = !(heavy || tall) || hdOn;
}

/** A page script the browser could not fetch (a dropped connection, a deploy since the page opened) is a TypeError whose message says so. */
const isChunkFailure = (e: unknown) => e instanceof TypeError && /dynamically imported module|importing a module script|error loading dynamically|failed to fetch/i.test(e.message);

/** The failure of a step with no name of its own, recorded as the step (see bare-error.ts); a script that failed to load says to reload. */
function stepFailure(step: string, e: unknown): Error {
  if (isChunkFailure(e)) return Object.assign(new NamedError('ScriptLoadFailed', 'Part of this page could not be loaded. Check your connection, reload the page and try again.'), { cause: e });
  return nameBare(step, e);
}

/** The background picture, opened. A file that will not open (HEIC rejects with something that is not an Error) is said so by name; a failure that already has a name of its own is kept. */
async function decodePicture(file: File) {
  try {
    return await (await import('../lib/image')).decodeImage(file);
  } catch (e) {
    if (e instanceof Error && !isUnspecific(e)) throw e;
    throw Object.assign(new NamedError('PictureUnreadable', 'This picture could not be opened. Remove it and add a JPEG or PNG copy instead.'), { cause: e });
  }
}

/** Pictures that did not open when they were added; Run stays off for them (see pictureBlocker), so the failure is said once, at the drop. */
const unopenable = new WeakSet<File>();
const PICTURE_MESSAGE = 'This picture could not be opened. Remove it and add a JPEG or PNG copy instead.';

const PICTURE_MISSING_HINT = 'Add a picture for the new background (JPG or PNG), or choose Blur or Colour.';
const REMOVE_BG = '/tools/remove-background';
const PICTURE_ONLY_MESSAGE =
  'Add a video too: this tool replaces the background of a video, and the picture is only the new background. To take the background out of a photo, use the Remove background tool instead.';

function pictureBlocker(files: ShellFile[]): string | { message: string; link?: { text: string; href: string } } {
  const pictures = files.filter((f) => isImage(f.file));
  // Only pictures were added: refused here, at the drop, so Run is never pressed (and no failed run is recorded).
  if (pictures.length > 0 && pictures.length === files.length) return { message: PICTURE_ONLY_MESSAGE, link: { text: 'Remove background tool', href: REMOVE_BG } };
  if (pictures.length === 0 && files.length > 0 && kind() === 'image') return PICTURE_MISSING_HINT;
  return pictures.length === 1 && unopenable.has(pictures[0]!.file) ? PICTURE_MESSAGE : '';
}

// The link in that refusal carries a single photo over to Remove background (see handoff.ts); any other click follows the plain link.
document.getElementById('run-hint')?.addEventListener('click', async (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(`a[href="${REMOVE_BG}"]`);
  const only = pictureOnly();
  if (!a || !only || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
  e.preventDefault();
  await saveHandoff({ name: only.name, blob: only }, a.pathname, 'Video background remover');
  location.assign(a.href);
});

/** Open the new background when it is added, not when Run is pressed: a picture that will not open is told then. */
async function checkPicture(files: ShellFile[]) {
  const pictures = files.filter((f) => isImage(f.file));
  if (pictures.length !== 1 || unopenable.has(pictures[0]!.file)) return;
  const file = pictures[0]!.file;
  try {
    (await decodePicture(file)).bitmap.close();
  } catch (e) {
    // A failure with a name of its own that is not the picture's (a script that would not load) is left for Run to say.
    if (e instanceof Error && e.name === 'PictureUnreadable') unopenable.add(file);
  }
  shell.refresh();
}

/** The one picture on the list when nothing else is, for the handoff above. */
let current: ShellFile[] = [];
const pictureOnly = () => (current.length === 1 && isImage(current[0]!.file) ? current[0]!.file : undefined);

const shell = createShell({
  runBlocker: pictureBlocker,
  onFilesChanged: async (files) => {
    current = files;
    // Fetch the page's own code now, while the deployment that served this page is most likely still current.
    if (files.some((f) => !isImage(f.file))) {
      warm(() => import('../lib/video-edit'));
      warm(() => import('../lib/person-mask'));
    }
    void checkPicture(files);
    await checkPhoneClip(files);
  },
  keepAwake: true,
  remembersSize: true,
  outputFormat: () => 'mp4',
  async process(files, progress) {
    // Where the run is, so a TypeError (no name of its own) is recorded as the step that threw it.
    let step = 'BackgroundSetupFailed';
    // From the first moment of the run, a leave records the mode and how far it got (see inflight.ts).
    noteRunDetail({ mode: finder() === 'fast' ? 'fast' : 'better', fraction: 0 });
    // The new background picture is closed when the run ends, however it ends.
    const held: { picture?: ImageBitmap } = {};
    try {
      return await run(files, progress, (name) => (step = name), held);
    } catch (e) {
      throw stepFailure(step, e);
    } finally {
      held.picture?.close();
    }
  },
});

async function run(files: ShellFile[], progress: Progress, at: (step: string) => void, held: { picture?: ImageBitmap }): Promise<OutputFile[]> {
  const pictures = files.filter((f) => isImage(f.file));
  let videos = files.filter((f) => !isImage(f.file));
  if (videos.length === 0) {
    if (pictures.length > 0) throw new NamedError('PictureWithoutVideo', PICTURE_ONLY_MESSAGE);
    throw new NamedError('NoVideo', `Add a video (MP4, MOV, WebM or MKV) to ${kind() === 'blur' ? 'blur' : 'replace'} its background.`);
  }
  if (pictures.length > 1) throw new NamedError('TooManyPictures', `${pictures.length} pictures were added. Keep one picture for the new background, remove the others, and run again.`);
  let bgKind = kind();
  if (pictures.length === 1) bgKind = 'image';
  else if (bgKind === 'image') throw new NamedError('PictureBackgroundMissing', 'Picture is chosen as the new background, but no picture was added. Add a JPG or PNG with the video, or choose Blur or Colour.');
  // Copy each video into memory right away: on Android a file picked from a cloud gallery (Google Photos, Drive) can stop being
  // readable by the time the person finder has downloaded. One the browser cannot reach says so now, before the download.
  videos = await Promise.all(videos.map(async (entry) => ({ ...entry, file: await snapshotFile(entry.file) })));
  const strength = num('strength', 6);
  const color = str('bg-color', '#00b140');
  // decodeImage also opens HEIC, which Chrome cannot decode on its own.
  const picture = (held.picture = pictures[0] ? (await decodePicture(pictures[0].file)).bitmap : undefined);

  // Find out now, in a second or two, that this browser cannot encode, not after the person finder has downloaded.
  progress.set('Checking this browser can write the video…', 0);
  if (!hasVideoEncoder()) throw new EncoderUnavailable();
  await requireH264Encoder();
  const { assertReadable, editVideo, videoSize, frameEstimate } = await lazyImport(() => import('../lib/video-edit'));
  // A clip this browser cannot decode (HEVC, say) is said so now, before the person finder's download.
  for (const v of videos) {
    await assertReadable(v.file).catch((e) => {
      // A 3GP with H.263 video opens as MP4 but cannot be decoded: the iPhone/HEVC advice would send the person the wrong way.
      if (e instanceof Error && e.name === 'UnsupportedCodec' && /\.3g[p2]$/i.test(v.file.name)) {
        throw new UnsupportedCodec(`${v.file.name} is a 3GP clip with video this browser cannot decode. Make an MP4 copy with the Video to MP4 tool, then add that.`);
      }
      throw e;
    });
  }
  // A file that is not a video this page opens (3GP, AVI, WMV, a renamed file) is said so now, with the way on, not after the download.
  for (const v of videos) {
    await videoSize(v.file).catch((e) => {
      if (!(e instanceof Error) || !['UnreadableFile', 'NoVideoTrack', 'UnreadableContainer'].includes(e.name)) return;
      throw Object.assign(new UnreadableFile(`${v.file.name} is not a video this page can read (MP4, MOV, WebM or MKV). Make an MP4 copy with the Video to MP4 tool, then add that.`), { cause: e });
    });
  }
  const which = finder();
  const size = which === 'fast' ? '12' : '28';
  progress.set(`Loading the person finder, once (about ${size} MB)…`, 0.01);
  at('PersonFinderLoadFailed');
  const { Matte, loadPersonMask } = await import('../lib/person-mask');
  // The fast model has a wide variant; load the one that fits the first video (a later one loads itself if it differs).
  const shape = await videoSize(videos[0]!.file).catch(() => undefined);
  // A phone that switches away during the download stops it: wait for the page, then fetch again.
  const page = pageRecoveryHooks((message) => progress.set(message, 0.01));
  try {
    await resumeWhenHidden(
      () =>
        loadPersonMask(which, shape, (f) => {
          const pct = Math.round(f * 100);
          progress.set(`Downloading the person finder, once (about ${size} MB): ${pct}%`, 0.01 + f * 0.02);
        }),
      page.hooks,
    );
  } finally {
    page.dispose();
  }
  at('VideoEditFailed');
  const outputs: OutputFile[] = [];
  for (const [index, entry] of videos.entries()) {
    const file = entry.file;
    const share = (f: number) => (index + f) / videos.length;
    const sizeFor = async (f: File) => outputSize((await videoSize(f).catch(() => undefined)) ?? { width: 0, height: 0 });
    const matte = new Matte(which);
    progress.set(`Preparing ${file.name}…`, share(0.03));
    const total = await frameEstimate(file);
    const blurred = document.createElement('canvas');
    // The first figures of a slow start run long (2 to 3 times too long on a phone), so wait for 8% and 10 s of real work.
    const timeLeft = new TimeLeft(undefined, { minFraction: 0.08, minSeconds: 10 });
    const r = await editVideo(file, {
      // After the page was hidden, or an encoder that stopped, the run starts again by itself: say so.
      onNotice: (message) => progress.set(`${file.name}: ${message}`, share(0.03)),
      // The frame is only drawn on and copied from; the person finder reads its own small canvas.
      readsBack: false,
      // Not bigger than it went in: the default quality writes about 70% more bits than a phone does.
      matchSourceBitrate: true,
      ...(await sizeFor(file)),
      async paint(ctx) {
        // A frame the finder or the background drawing fails on (a null canvas, a missing browser feature) says so by name.
        await matte
          .apply(ctx, (c, _frame, seen) => {
            if (bgKind === 'color') {
              c.fillStyle = color;
              c.fillRect(0, 0, c.canvas.width, c.canvas.height);
            } else if (bgKind === 'image') cover(c, picture!);
            else drawBlurred(c, seen, blurred, strength);
          })
          .catch((e) => {
            throw nameBare('PersonFrameFailed', e);
          });
      },
      onProgress: (f) => {
        // It is slower than the video plays, so say how long is left: a long run with only a percentage reads as stuck.
        const left = timeLeft.update(f) ?? 'Estimating time left…';
        noteRunDetail({ fraction: share(f) });
        // "Frame X of Y" from the frames the finder has done and the clip's own rate; without a rate, the percentage alone.
        const frames = total ? `Frame ${Math.min(matte.frames, total).toLocaleString('en-US')} of ${total.toLocaleString('en-US')} · ` : '';
        progress.set(`Replacing the background of ${file.name}: ${frames}${Math.round(f * 100)}% · ${left}. Keep this tab open.`, share(0.03 + f * 0.97));
      },
    }).finally(() => {
      // Safari frees a dropped canvas late and caps all of them together: hand these back now, before the next video.
      matte.dispose();
      releaseCanvas(blurred);
    });
    const found = matte.frames ? matte.framesWithPerson / matte.frames : 0;
    const what = bgKind === 'blur' ? 'background blurred' : bgKind === 'color' ? `background ${color}` : `background from ${pictures[0]!.file.name}`;
    const made: OutputFile = {
      name: suffixName(file.name, bgKind === 'blur' ? '-blurred-background' : '-new-background', r.ext),
      blob: r.blob,
      originalSize: file.size,
      note: `${describeEdit(r)}${retryNote(r.retry, r)}, ${what}, ${found < 0.05 ? 'no person found, so the whole picture was treated as background' : `a person in ${Math.round(found * 100)}% of frames`}. ${matte.pathNote()}${frameSplit(r.timing)}`,
    };
    // Fast in dim light: the picture came back as it was. Said as an error that names the fix; the file stays downloadable.
    if (which === 'fast' && found < 0.05) throw Object.assign(new NamedError('FastFoundNoPerson', lowLightMessage(file.name)), { salvage: [made] });
    outputs.push(made);
  }
  return outputs;
}
