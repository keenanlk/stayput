import { createShell } from '../lib/shell';
import { downloadBlob, baseName, type OutputFile } from '../lib/files';
import { classifyError, trackFilesAdded, trackToolRun } from '../lib/analytics';
import { decodeImage, drawScaled, fitSize } from '../lib/image';
import {
  CAMERA_COPY,
  MESSAGES,
  cameraFailure,
  collectCodes,
  describeCode,
  detectPlatform,
  type CameraState,
  type CodeDescription,
  type Hit,
} from '../lib/qr-scan';
import type { ScanMode, ScanReply, ScanRequest } from '../lib/qr-scan.worker';

/**
 * QR code scanner. Images arrive through the shell (choose, drop, paste); the
 * camera is a second route that starts only when its button is pressed. The
 * code is read by ZXing-C++ in a worker, on this device. What a code holds is
 * only ever displayed (textContent, never markup) and nothing is opened for
 * the visitor: a link opens only through a button they press.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const slug = () => root.dataset.slug ?? 'qr-code-scanner';
const results = $('qs-results');
const camera = $('qs-camera');
const video = $<HTMLVideoElement>('qs-video');
const idle = $('qs-idle');
const startBtn = $<HTMLButtonElement>('qs-start');
const stopBtn = $<HTMLButtonElement>('qs-stop');
const switchBtn = $<HTMLButtonElement>('qs-switch');
const torchBtn = $<HTMLButtonElement>('qs-torch');
const note = $('qs-note');

const MAX_SIDE = 2048;
const MAX_IMAGES = 20;
const MAX_CODES = 8;

// ---------- the decoder worker ----------

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, (r: ScanReply) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('../lib/qr-scan.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<ScanReply>) => {
    pending.get(e.data.id)?.(e.data);
    pending.delete(e.data.id);
  };
  w.onerror = () => {
    for (const resolve of pending.values()) resolve({ id: 0, error: 'load' });
    pending.clear();
    worker = undefined;
  };
  worker = w;
  return w;
}

function scan(image: ImageData, mode: ScanMode): Promise<ScanReply> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const req: ScanRequest = { id, width: image.width, height: image.height, data: image.data.buffer as ArrayBuffer, mode };
    getWorker().postMessage(req, [req.data]);
  });
}

// ---------- drawing cards (textContent only) ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

async function copyText(value: string, button: HTMLButtonElement, label: string) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(value);
    ok = true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
  }
  button.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => (button.textContent = label), 2000);
}

const DOTS = '••••••••';

function renderCard(d: CodeDescription, index: number, total: number, count: number): HTMLElement {
  const card = el('article', 'qs-card');
  card.dataset.kind = d.kind;
  if (total > 1) card.append(el('h3', '', `Code ${index + 1} of ${total}`));
  card.append(el('span', 'qs-kind', d.label));
  if (count > 1) card.append(el('p', 'muted small', count === 2 ? 'Found twice.' : `Found ${count} times.`));

  if (d.link) {
    const domain = el('p', 'qs-domain');
    domain.append(document.createTextNode(d.link.lead), el('strong', '', d.link.strong));
    card.append(domain, el('pre', 'qs-address', d.link.address));
  }
  if (d.warnings.length) {
    const list = el('ul', 'qs-warnings');
    for (const w of d.warnings) list.append(el('li', '', w));
    card.append(list);
  }
  if (d.fields.length) {
    const dl = el('dl', 'qs-fields');
    for (const f of d.fields) {
      const row = el('div');
      const dd = el('dd');
      if (f.secret) {
        let shown = false;
        dd.textContent = DOTS;
        const toggle = el('button', 'btn btn-sm btn-ghost', 'Show');
        toggle.type = 'button';
        toggle.addEventListener('click', () => {
          shown = !shown;
          dd.firstChild!.textContent = shown ? f.value : DOTS;
          toggle.textContent = shown ? 'Hide' : 'Show';
        });
        const wrap = el('dd');
        wrap.append(dd, toggle);
        row.append(el('dt', '', f.label), wrap);
      } else {
        dd.textContent = f.value;
        row.append(el('dt', '', f.label), dd);
      }
      dl.append(row);
    }
    card.append(dl);
  }
  if (d.hex) card.append(el('pre', 'qs-text', d.hex));
  else if (d.kind === 'event') card.append(el('pre', 'qs-text', d.text));
  else if (d.kind === 'text' || d.kind === 'matrix') card.append(el('pre', 'qs-text', d.text));
  else if (d.kind === 'app' || d.kind === 'barcode' || d.kind === 'address') card.append(el('pre', 'qs-address', d.text));
  for (const n of d.notes) if (d.kind !== 'event') card.append(el('p', d.kind === 'link' ? 'muted small' : '', n));

  const actions = el('div', 'qs-actions');
  for (const c of d.copies) {
    const b = el('button', 'btn btn-sm', c.label);
    b.type = 'button';
    b.addEventListener('click', () => void copyText(c.value, b, c.label));
    actions.append(b);
  }
  if (d.save) {
    const s = d.save;
    const b = el('button', 'btn btn-sm', s.label);
    b.type = 'button';
    b.addEventListener('click', () => downloadBlob(new Blob([s.content], { type: s.mime }), s.filename));
    actions.append(b);
  }
  if (d.open) {
    // The only way out of this page: an anchor the visitor presses. The page never navigates by itself.
    const a = el('a', 'btn btn-sm btn-primary', d.open.label);
    a.href = d.open.href;
    if (/^https?:/i.test(d.open.href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      a.referrerPolicy = 'no-referrer';
    } else {
      a.rel = 'noopener noreferrer';
    }
    actions.append(a);
  }
  if (actions.childElementCount) card.append(actions);
  return card;
}

function renderCodes(hits: Hit[], target: HTMLElement, imageHeight: number): number {
  const { codes, capped } = collectCodes(hits, imageHeight, MAX_CODES);
  if (codes.length > 1) target.append(el('p', 'qs-summary', `Found ${codes.length} codes in this image.${capped ? ` Showing the first ${MAX_CODES}.` : ''}`));
  else if (capped) target.append(el('p', 'qs-summary', `Showing the first ${MAX_CODES}.`));
  codes.forEach(({ hit, count }, i) => {
    target.append(renderCard(describeCode(hit.text, hit.format, { bytes: hit.bytes, contentType: hit.contentType }), i, codes.length, count));
  });
  return codes.length;
}

function tipsList(tips: readonly string[]): HTMLElement {
  const ul = el('ul');
  for (const t of tips) ul.append(el('li', '', t));
  return ul;
}

function failureBlock(message: string, tips: readonly string[] = []): HTMLElement {
  const box = el('div', 'qs-fail');
  box.append(el('p', '', message));
  if (tips.length) box.append(tipsList(tips));
  return box;
}

// ---------- images (through the shell) ----------

interface ImageOutcome {
  hits: Hit[];
  height: number;
}

function failure(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

/** One image to its decoded codes. Throws an Error whose name says why nothing was read. */
async function readImage(file: File): Promise<ImageOutcome> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) throw failure('NotAnImage', MESSAGES.pdf);
  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch (e) {
    const memory = e instanceof RangeError || (e instanceof Error && /memory|allocate|too large/i.test(e.message));
    throw memory ? failure('RangeError', MESSAGES.tooLarge) : failure('UnreadableFile', MESSAGES.notImage);
  }
  let pixels: ImageData;
  try {
    const { width, height } = fitSize(decoded.width, decoded.height, { maxWidth: MAX_SIDE, maxHeight: MAX_SIDE });
    // White behind transparent pixels: a transparent PNG would otherwise be read as black.
    const canvas = drawScaled(decoded.bitmap, width, height, '#ffffff');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    pixels = ctx.getImageData(0, 0, width, height) as ImageData;
  } catch {
    throw failure('RangeError', MESSAGES.tooLarge);
  } finally {
    decoded.bitmap.close();
  }
  const height = pixels.height;
  const reply = await scan(pixels, 'image');
  if (reply.error === 'load') throw failure('DecoderLoadError', MESSAGES.decoderFailed);
  if (reply.error || !reply.hits) throw failure('UnreadableFile', MESSAGES.notImage);
  if (reply.hits.length === 0) {
    throw (reply.invalid ?? 0) > 0 ? failure('DamagedCode', MESSAGES.damaged) : failure('NoCodeFound', MESSAGES.noCode);
  }
  return { hits: reply.hits, height };
}

// A read has finished for the images in the list: the next image replaces them, instead of being read with them again.
let settled = false;

const shell = createShell({
  autoDownloadSingle: false,
  outputFormat: () => 'image',
  resultsTitle: () => 'Codes read',
  async process(files, progress) {
    settled = true;
    results.replaceChildren();
    const outputs: OutputFile[] = [];
    const skipped: { name: string; reason: string }[] = [];
    const several = files.length > 1;
    let firstError: Error | undefined;
    const batch = files.slice(0, MAX_IMAGES);
    for (const extra of files.slice(MAX_IMAGES)) skipped.push({ name: extra.file.name, reason: `only ${MAX_IMAGES} images are read at a time` });
    for (const [i, entry] of batch.entries()) {
      progress.set(`Reading ${entry.file.name} (${i + 1} of ${batch.length})`, i / batch.length);
      const section = el('section');
      if (several) section.append(el('p', 'qs-file', entry.file.name));
      try {
        const out = await readImage(entry.file);
        const shown = collectCodes(out.hits, out.height, MAX_CODES).codes;
        const group = el('div', 'qs-results');
        const n = renderCodes(out.hits, group, out.height);
        section.append(group);
        const text = shown.map((c) => c.hit.text).join('\n');
        outputs.push({ name: `${baseName(entry.file.name)}-code.txt`, blob: new Blob([text], { type: 'text/plain' }), text, badge: 'TXT', note: `${n} ${n === 1 ? 'code' : 'codes'}` });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.warn(entry.file.name, err.name);
        firstError ??= err;
        skipped.push({ name: entry.file.name, reason: err.message });
        if (several) section.append(failureBlock(err.message, err.name === 'NoCodeFound' ? MESSAGES.noCodeTips : []));
      }
      results.append(section);
    }
    progress.set('Done', 1);
    if (outputs.length === 0) {
      // The shell shows this on its error line; the tips sit under it for a single image.
      if (!several) {
        results.replaceChildren();
        if (firstError?.name === 'NoCodeFound') results.append(tipsList(MESSAGES.noCodeTips));
      }
      throw firstError ?? failure('NoCodeFound', MESSAGES.noCode);
    }
    return { outputs, skipped: several ? skipped : [] };
  },
});

// Reading starts by itself when an image arrives; the Run button stays as a fallback.
const runButton = $<HTMLButtonElement>('run');
root.addEventListener('stayput:files', () => {
  results.replaceChildren();
  releaseCamera();
  let tries = 0;
  const go = () => {
    if (shell.files.length === 0) return;
    if (!runButton.disabled) runButton.click();
    else if (tries++ < 40) setTimeout(go, 150);
  };
  go();
});
$('clear').addEventListener('click', () => {
  settled = false;
  results.replaceChildren();
});
const replaceFinished = () => {
  if (settled) $('clear').click();
};
// Capture phase, so this runs before the shell adds the new files.
$('file-input').addEventListener('change', replaceFinished, { capture: true });
document.addEventListener('drop', (e) => e.dataTransfer?.files?.length && replaceFinished(), { capture: true });
document.addEventListener('paste', (e) => e.clipboardData?.files?.length && replaceFinished(), { capture: true });

// ---------- the camera ----------

let stream: MediaStream | undefined;
let frameTimer = 0;
let stillTimer = 0;
let busy = false;
let empty = 0;
let startedAt = 0;
let deviceIds: string[] = [];
let deviceIndex = -1;
let torchOn = false;
// An attempt runs from a page load, or the last success, to the next success: files_added once, then the first ok.
let attempt: { ok: boolean } | undefined;
const frame = document.createElement('canvas');

function say(lines: string | string[], warn = false) {
  note.textContent = Array.isArray(lines) ? lines.join('\n') : lines;
  note.classList.toggle('is-warn', warn);
}

function setState(state: CameraState | 'done') {
  camera.dataset.state = state;
  const live = state === 'live';
  const asking = state === 'asking';
  idle.hidden = live;
  video.hidden = !live;
  startBtn.hidden = live || asking;
  startBtn.textContent = state === 'done' ? 'Scan again' : 'Scan with camera';
  stopBtn.hidden = !live;
  switchBtn.hidden = !live || deviceIds.length < 2;
  if (!live) torchBtn.hidden = true;
}

function releaseCamera() {
  clearTimeout(frameTimer);
  clearTimeout(stillTimer);
  busy = false;
  const s = stream;
  stream = undefined;
  for (const t of s?.getTracks() ?? []) t.stop();
  video.srcObject = null;
  torchOn = false;
  torchBtn.setAttribute('aria-pressed', 'false');
}

function stopWith(state: CameraState, message: string) {
  releaseCamera();
  setState(state);
  say(message);
}

const hasRvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

function nextFrame(cb: () => void) {
  if (hasRvfc) (video as HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number }).requestVideoFrameCallback(cb);
  else requestAnimationFrame(cb);
}

function loop(token: MediaStream) {
  const tick = async () => {
    if (stream !== token) return;
    if (busy || video.readyState < 2 || !video.videoWidth) return nextFrame(schedule);
    busy = true;
    try {
      const { width, height } = fitSize(video.videoWidth, video.videoHeight, { maxWidth: 1280, maxHeight: 1280 });
      frame.width = width;
      frame.height = height;
      // Never mirrored: the preview may be, the pixels sent to the reader are not.
      const ctx = frame.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0, width, height);
      const reply = await scan(ctx.getImageData(0, 0, width, height), empty > 0 && empty % 5 === 0 ? 'live-hard' : 'live');
      if (stream !== token) return;
      if (reply.error === 'load') {
        failStart('DecoderLoadError', MESSAGES.decoderFailed);
        return;
      }
      if (reply.hits && reply.hits.length > 0) return void finishCamera(reply.hits, height);
      empty++;
    } finally {
      busy = false;
    }
    if (stream === token) nextFrame(schedule);
  };
  // At most about six reads a second.
  const schedule = () => {
    if (stream !== token) return;
    frameTimer = window.setTimeout(() => void tick(), 150);
  };
  schedule();
}

function finishCamera(hits: Hit[], height: number) {
  const ms = performance.now() - startedAt;
  releaseCamera();
  results.replaceChildren();
  renderCodes(hits, results, height);
  setState('done');
  say('');
  const firstOk = !!attempt && !attempt.ok;
  if (attempt) attempt.ok = true;
  trackToolRun({ tool: slug(), outcome: 'ok', firstOk, files: 1, inputBytes: 0, ms, format: 'camera' });
  root.dispatchEvent(new CustomEvent('stayput:done'));
  results.scrollIntoView({ block: 'nearest' });
}

function failStart(errorClass: string, message: string | string[], state: CameraState = 'other') {
  releaseCamera();
  setState(state);
  say(message, true);
  trackToolRun({ tool: slug(), outcome: 'error', files: 1, inputBytes: 0, ms: performance.now() - startedAt, format: 'camera', errorClass });
}

async function open(deviceId?: string): Promise<MediaStream> {
  const wanted: MediaStreamConstraints = deviceId
    ? { video: { deviceId: { exact: deviceId } }, audio: false }
    : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
  try {
    return await navigator.mediaDevices.getUserMedia(wanted);
  } catch (e) {
    // A laptop has no rear camera; `ideal` rarely fails, but some browsers still refuse the constraints.
    if (e instanceof DOMException && e.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    throw e;
  }
}

async function start(deviceId?: string) {
  releaseCamera();
  results.replaceChildren();
  startedAt = performance.now();
  empty = 0;
  const tool = slug();
  // One files_added per attempt, so first-ok runs over files_added stays a completion rate when the camera is used.
  if (!deviceId && (!attempt || attempt.ok)) {
    attempt = { ok: false };
    trackFilesAdded({ tool, files: 1, inputBytes: 0 });
  }
  if (window.isSecureContext === false) return failStart('InsecureContext', CAMERA_COPY.insecure, 'insecure');
  if (!navigator.mediaDevices?.getUserMedia) return failStart('NoCameraApi', CAMERA_COPY.noApi, 'no-api');
  setState('asking');
  say(CAMERA_COPY.asking);
  let s: MediaStream;
  try {
    s = await open(deviceId);
  } catch (e) {
    const name = e instanceof DOMException || e instanceof Error ? e.name : '';
    let dismissed = false;
    if (name === 'NotAllowedError' && performance.now() - startedAt < 1000) {
      try {
        dismissed = (await navigator.permissions.query({ name: 'camera' as PermissionName })).state === 'prompt';
      } catch {
        dismissed = false;
      }
    }
    const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    const f = cameraFailure(name, { platform, dismissed });
    return failStart(classifyError(e), f.lines, f.state);
  }
  if (document.hidden) {
    // The tab was left while the prompt was open: do not keep the camera running in the background.
    for (const t of s.getTracks()) t.stop();
    return stopWith('idle', CAMERA_COPY.hidden);
  }
  stream = s;
  const track = s.getVideoTracks()[0];
  track?.addEventListener('ended', () => {
    if (stream === s) stopWith('ended', CAMERA_COPY.ended);
  });
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId);
    deviceIds = cams.map((d) => d.deviceId);
    deviceIndex = deviceIds.indexOf(track?.getSettings().deviceId ?? '');
  } catch {
    deviceIds = [];
  }
  const settings = track?.getSettings() ?? {};
  camera.dataset.mirror = String(settings.facingMode === 'user');
  const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
  video.srcObject = s;
  setState('live');
  torchBtn.hidden = !caps.torch;
  say(CAMERA_COPY.live);
  stillTimer = window.setTimeout(() => say(CAMERA_COPY.stillLooking), 15_000);
  await video.play().catch(() => {});
  if (stream === s) loop(s);
}

startBtn.addEventListener('click', () => void start());
stopBtn.addEventListener('click', () => {
  releaseCamera();
  setState('idle');
  say('');
});
switchBtn.addEventListener('click', () => {
  if (deviceIds.length < 2) return;
  deviceIndex = (deviceIndex + 1) % deviceIds.length;
  void start(deviceIds[deviceIndex]);
});
torchBtn.addEventListener('click', () => {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  torchOn = !torchOn;
  track.applyConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] }).then(
    () => torchBtn.setAttribute('aria-pressed', String(torchOn)),
    () => {
      torchOn = false;
    },
  );
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && stream) stopWith('idle', CAMERA_COPY.hidden);
});
window.addEventListener('pagehide', releaseCamera);
window.addEventListener('beforeunload', releaseCamera);
setState('idle');
