import { bool, createShell, num } from '../lib/shell';
import { downloadBlob } from '../lib/files';
import { trackToolRun } from '../lib/analytics';

/**
 * Webcam test. The camera is shown from a local stream, its settings read from
 * the browser, the real frame rate counted from the frames the page receives,
 * and a snapshot drawn to a canvas and saved as JPG. Nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const panel = $('cam-panel');
const video = $<HTMLVideoElement>('cam-video');
const idle = $('cam-idle');
const verdict = $('cam-verdict');
const startBtn = $<HTMLButtonElement>('cam-start');
const snapBtn = $<HTMLButtonElement>('cam-snap');
const stopBtn = $<HTMLButtonElement>('cam-stop');
const device = $<HTMLSelectElement>('cam-device');
const facts = $('cam-facts');
const note = $('cam-note');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

let stream: MediaStream | undefined;
let counting = 0;
let tracked = false;

function say(text: string, warn = false) {
  note.textContent = text;
  note.classList.toggle('is-warn', warn);
}

function setState(state: 'idle' | 'live') {
  panel.dataset.state = state;
  idle.hidden = state !== 'idle';
  video.hidden = verdict.hidden = facts.hidden = state === 'idle';
  startBtn.hidden = state !== 'idle';
  snapBtn.hidden = stopBtn.hidden = state === 'idle';
}

const mirror = () => (panel.dataset.mirror = String(bool('cam-mirror')));

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function aspect(w: number, h: number): string {
  const r = w / h;
  const known: [number, string][] = [[16 / 9, '16:9'], [4 / 3, '4:3'], [1, '1:1'], [16 / 10, '16:10'], [21 / 9, '21:9']];
  const hit = known.find(([k]) => Math.abs(k - r) < 0.02);
  if (hit) return hit[1];
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

async function listDevices() {
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId);
    const chosen = device.value;
    device.length = 1;
    cams.forEach((d, i) => device.add(new Option(d.label || `Camera ${i + 1}`, d.deviceId)));
    device.value = cams.some((d) => d.deviceId === chosen) ? chosen : '';
  } catch {
    // Device names are optional.
  }
}

function release() {
  cancelAnimationFrame(counting);
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = undefined;
  video.srcObject = null;
}

/** Count the frames that actually arrive for two seconds, since cameras deliver fewer in dim light. */
function measureFps(requested?: number) {
  const out = $('cam-fps');
  const hasRvfc = 'requestVideoFrameCallback' in video;
  let frames = 0;
  let start = 0;
  const label = (measured?: number) => (out.textContent = [requested ? `${Math.round(requested)} requested` : '', measured !== undefined ? `${Math.round(measured)} measured` : 'measuring…'].filter(Boolean).join(', '));
  label();
  const tick = (now: number) => {
    if (!stream) return;
    if (!start) start = now;
    frames++;
    if (now - start >= 2000) {
      const fps = ((frames - 1) * 1000) / (now - start);
      label(fps);
      if (fps < 15) say('Fewer than 15 frames per second arrive, so motion will look jerky. More light usually helps: cameras slow down in the dark.', true);
      return;
    }
    if (hasRvfc) (video as HTMLVideoElement & { requestVideoFrameCallback(cb: (now: number) => void): number }).requestVideoFrameCallback(tick);
    else counting = requestAnimationFrame(tick);
  };
  if (hasRvfc) (video as HTMLVideoElement & { requestVideoFrameCallback(cb: (now: number) => void): number }).requestVideoFrameCallback(tick);
  else counting = requestAnimationFrame(tick);
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    say('This browser cannot use a camera in web pages. Recent Chrome, Edge, Firefox and Safari can.', true);
    return;
  }
  release();
  say('');
  const height = num('cam-quality', 1080);
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: device.value ? { exact: device.value } : undefined, width: { ideal: Math.round((height * 16) / 9) }, height: { ideal: height } },
      audio: false,
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    say(
      name === 'NotAllowedError'
        ? 'The camera is blocked for this page. Allow it from the icon at the left of the address bar (or in your system privacy settings), then try again.'
        : name === 'NotFoundError'
          ? 'No camera was found. Plug one in, or check it is not disabled in your system settings.'
          : name === 'NotReadableError'
            ? 'The camera is in use by another app, or blocked by a privacy switch or cover. Close Zoom, Teams or other camera apps and try again.'
            : `The camera could not start: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
    return;
  }
  await listDevices();
  const track = stream.getVideoTracks()[0];
  const s = track?.getSettings() ?? {};
  if (s.deviceId && [...device.options].some((o) => o.value === s.deviceId)) device.value = s.deviceId;
  video.srcObject = stream;
  await video.play().catch(() => {});
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  const w = video.videoWidth || s.width || 0;
  const h = video.videoHeight || s.height || 0;
  $('cam-name').textContent = track?.label || 'Default camera';
  $('cam-res').textContent = w && h ? `${w} × ${h}${h >= 2160 ? ' (4K)' : h >= 1080 ? ' (1080p)' : h >= 720 ? ' (720p)' : h >= 480 ? ' (480p)' : ''}` : '–';
  $('cam-aspect').textContent = w && h ? aspect(w, h) : '–';
  verdict.textContent = 'Your camera works';
  setState('live');
  mirror();
  measureFps(s.frameRate);
  if (h && h < height && h < 1080) say(`The camera gave ${h}p when ${height}p was asked for; that is the most it offers here.`);
  if (!tracked) {
    tracked = true;
    trackToolRun({ tool: root.dataset.slug ?? 'webcam-test', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0, format: 'camera' });
    root.dispatchEvent(new CustomEvent('stayput:done'));
  }
}

function snapshot() {
  if (!stream || !video.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const g = c.getContext('2d')!;
  if (bool('cam-mirror')) {
    g.translate(c.width, 0);
    g.scale(-1, 1);
  }
  g.drawImage(video, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  c.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, `webcam-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`);
    },
    'image/jpeg',
    0.92,
  );
}

startBtn.addEventListener('click', () => void start());
snapBtn.addEventListener('click', snapshot);
stopBtn.addEventListener('click', () => {
  release();
  setState('idle');
  say('The camera is off.');
});
device.addEventListener('change', () => {
  if (stream) void start();
});
$('cam-quality').addEventListener('change', () => {
  if (stream) void start();
});
$('cam-mirror').addEventListener('change', mirror);
setState('idle');
mirror();
