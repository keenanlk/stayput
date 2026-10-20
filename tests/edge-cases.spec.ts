// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { bigPng, longWav } from './edge-cases-files';

/**
 * Edge-case file corpus against the most-used tools (see fixtures/edge-cases/README.md for the files and the tool list).
 * Every case ends one of two ways, and nothing else passes:
 *   (a) a result whose files are non-empty and open (a picture decodes, a video loads with a duration, a sound decodes), or
 *   (b) an early refusal: the error panel shows readable copy, and the run records a named error class
 *       (not "Error", not empty); a file refused the moment it is added (empty files) never starts a run, so it has no class.
 * A run that is still going when the guard runs out is reported as a hang. Cases that fail today are marked with
 * `known`: they run under test.fail(), so CI stays green, the failure stays visible, and the case flips (CI goes red) the
 * day the fix lands, which is the cue to delete the marker.
 */
const edge = (name: string) => fileURLToPath(new URL(`./fixtures/edge-cases/${name}`, import.meta.url));
const stat = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

type Want = 'output' | 'refusal' | 'any';
type Kind = 'video' | 'audio' | 'image' | 'pdf';
interface Known {
  /** Why the case fails today and what would fix it. */
  item: string;
  /** Only this browser project fails; left out, every browser does. */
  browser?: 'chromium' | 'webkit';
}
interface Sample {
  /** A path under tests/fixtures/edge-cases, or an absolute path (a generated or reused file). */
  file: string;
  /** What is acceptable: a result, a named refusal, or either. */
  want: Want;
  /** Length in seconds of the sound or picture, to check the output against. */
  seconds?: number;
  /** The picture shows turned (240x320 on screen), and the output must too. */
  portrait?: boolean;
  /** The output may keep a codec this browser cannot play (HEVC in a copied stream): only its size and container are checked. */
  opaque?: boolean;
  /** The video has no sound track; a tool that needs sound must refuse it as NoSoundTrack, the name the caption tools already use. */
  noSound?: boolean;
  /** Browsers that skip this file. */
  skip?: { browser: 'chromium' | 'webkit'; why: string };
  known?: Known;
}
interface ToolSpec {
  path: string;
  /** Completed runs since Oct 8 2026 (see the README), for the record. */
  kinds: Kind[];
  /** The speech model is replaced by a stand-in: what is tested is how the file is read and what a failure is called. */
  speech?: boolean;
  /** The tool works on the sound. */
  needsSound?: boolean;
  /** Choose what to do before Run, for tools that will not start on the defaults. */
  before?: (page: Page) => Promise<void>;
  /** The output keeps the input's length. */
  keepsLength?: boolean;
  /** Longer guard for the tools that load a model. */
  slow?: boolean;
}

const VIDEO: Sample[] = [
  { file: 'good.mp4', want: 'output', seconds: 2 },
  { file: 'good.webm', want: 'output', seconds: 2 },
  { file: 'mp4-named.mov', want: 'output', seconds: 2 },
  { file: 'rotated-90.mp4', want: 'output', seconds: 2, portrait: true },
  { file: 'vfr.mp4', want: 'output' },
  { file: 'silent-track.mp4', want: 'any', seconds: 2 },
  { file: 'no-audio.mp4', want: 'any', seconds: 2, noSound: true },
  { file: 'tiny-16x16.mp4', want: 'any', noSound: true },
  { file: 'hevc.mp4', want: 'any', opaque: true },
  { file: 'hdr10-hevc.mp4', want: 'any', opaque: true },
  { file: 'audio-only-named.mp4', want: 'any' },
  { file: 'zero.mp4', want: 'refusal' },
  { file: 'zeros.mp4', want: 'refusal' },
  { file: 'sample.ts', want: 'any' },
  { file: 'odd-853x481.webm', want: 'any', noSound: true },
  { file: 'mjpeg.mov', want: 'any' },
  { file: 'ac3-51.mkv', want: 'any' },
  { file: 'truncated-moov-end.mp4', want: 'any' },
  { file: 'truncated-half.mp4', want: 'any' },
  { file: 'corrupt-header.mp4', want: 'refusal' },
  { file: 'text-named.mp4', want: 'refusal' },
  { file: stat('uhd-flat.mp4'), want: 'any', noSound: true, skip: { browser: 'webkit', why: 'software 4K H.264 decoding in Linux WebKit takes minutes on a CI runner, which says nothing about the tool' } },
];
const AUDIO: Sample[] = [
  { file: 'good.mp3', want: 'output', seconds: 2 },
  { file: 'good.ogg', want: 'output', seconds: 2 },
  { file: 'mulaw-8k.wav', want: 'output', seconds: 2 },
  { file: 'pcm24-48k-stereo.wav', want: 'output', seconds: 1 },
  { file: 'float32.wav', want: 'output', seconds: 2 },
  { file: 'pcm8-11k.wav', want: 'output', seconds: 2 },
  { file: 'flac24.flac', want: 'output', seconds: 2 },
  { file: 'silent.wav', want: 'any', seconds: 2 },
  { file: 'silent.mp3', want: 'any', seconds: 2 },
  { file: 'zero.mp3', want: 'refusal' },
  { file: 'truncated-half.mp3', want: 'any' },
  { file: 'corrupt-header.mp3', want: 'any' },
  { file: 'corrupt-header.wav', want: 'refusal' },
  { file: 'wav-length-lies.wav', want: 'any' },
  { file: 'text-named.mp3', want: 'refusal' },
  { file: 'alac.m4a', want: 'any' },
  { file: 'rf64.wav', want: 'any' },
];
const IMAGE: Sample[] = [
  { file: 'good.png', want: 'output' },
  { file: 'good.jpg', want: 'output' },
  { file: 'png-named.jpg', want: 'output' },
  { file: 'jpg-named.png', want: 'output' },
  { file: 'cmyk.jpg', want: 'output' },
  { file: 'png16.png', want: 'output' },
  { file: 'gray16.png', want: 'output' },
  { file: 'alpha.png', want: 'output' },
  { file: '1x1.png', want: 'any' },
  { file: 'exif-rotated.jpg', want: 'output' },
  { file: 'heic-still.heic', want: 'output' },
  { file: 'heic-tiled.heic', want: 'any' },
  { file: 'heic-alpha.heic', want: 'output' },
  { file: 'heic-10bit.heic', want: 'any' },
  { file: 'zero.png', want: 'refusal' },
  { file: 'truncated-half.png', want: 'any' },
  { file: 'truncated-half.jpg', want: 'any' },
  { file: 'corrupt-header.png', want: 'refusal' },
  { file: 'corrupt-header.jpg', want: 'refusal' },
  { file: 'text-named.png', want: 'refusal' },
  { file: 'garbage.jpg', want: 'refusal' },
];
const PDF: Sample[] = [
  { file: 'good.pdf', want: 'output' },
  { file: stat('user-locked.pdf'), want: 'refusal' },
  { file: stat('owner-locked.pdf'), want: 'any' },
  { file: 'zero.pdf', want: 'refusal' },
  { file: 'truncated-half.pdf', want: 'any' },
  { file: 'broken-xref.pdf', want: 'any' },
  { file: 'corrupt-header.pdf', want: 'refusal' },
  { file: 'text-named.pdf', want: 'refusal' },
  { file: 'png-named.pdf', want: 'refusal' },
];
const SAMPLES: Record<Kind, Sample[]> = { video: VIDEO, audio: AUDIO, image: IMAGE, pdf: PDF };

/** Crop PDF will not run until an area is chosen: draw one on the first page (a file that did not open has no page, and runs into its refusal). */
async function dragCropBox(page: Page) {
  const panel = page.locator('#crop-panel');
  if (!(await panel.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false))) return;
  await page.locator('#auto-trim').click();
  await expect(page.locator('#crop-result')).not.toHaveText('', { timeout: 10_000 });
  if ((await page.locator('.crop-box').count()) > 0) return;
  await page.locator('#stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const s = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(s.x + s.width * 0.25, s.y + s.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width * 0.7, s.y + s.height * 0.6, { steps: 4 });
  await page.mouse.up();
}

const TOOLS: ToolSpec[] = [
  { path: '/burn-subtitles-into-video', needsSound: true, kinds: ['video'], speech: true, keepsLength: true, slow: true },
  { path: '/video-to-subtitles', needsSound: true, kinds: ['video', 'audio'], speech: true },
  { path: '/remove-background-noise-from-video', needsSound: true, kinds: ['video', 'audio'], keepsLength: true, slow: true },
  { path: '/tools/remove-noise', needsSound: true, kinds: ['audio', 'video'], keepsLength: true, slow: true },
  { path: '/tools/volume-booster', needsSound: true, kinds: ['audio', 'video'], keepsLength: true },
  { path: '/blur-video-background', kinds: ['video'], keepsLength: true, slow: true },
  { path: '/instagram-carousel-splitter', kinds: ['image'] },
  { path: '/increase-video-volume', needsSound: true, kinds: ['video'], keepsLength: true },
  { path: '/auto-caption-video', needsSound: true, kinds: ['video'], speech: true, keepsLength: true, slow: true },
  { path: '/tools/video-background-remover', kinds: ['video'], keepsLength: true, slow: true },
  { path: '/tools/blur-face-video', kinds: ['video'], keepsLength: true, slow: true },
  { path: '/ogg-to-mp3', needsSound: true, kinds: ['audio', 'video'], keepsLength: true },
  { path: '/tools/resize-video', kinds: ['video'], keepsLength: true },
  { path: '/tools/crop-pdf', before: dragCropBox, kinds: ['pdf'] },
  { path: '/image-to-pixel-art', kinds: ['image'] },
];

/**
 * Cases that fail today. Each runs under test.fail(): CI stays green while the failure is on record, and the case turns red
 * the day the fix lands (remove its entry then). Every entry says why it fails.
 */
const KNOWN: Record<string, Known> = {};

// ---------------------------------------------------------------------------------------------------------------
const GUARD_MS = 40_000;
const SLOW_GUARD_MS = 100_000;
/** What a failed run may not be called: the names that say nothing about where it failed (see src/lib/bare-error.ts). */
const UNNAMED = new Set(['', 'Error', 'Unknown', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError']);

interface Probe {
  name: string;
  size: number;
  kind: string;
  /** Why the file does not open, when it does not. */
  problem?: string;
  duration?: number;
  width?: number;
  height?: number;
}
type Outcome =
  | { kind: 'output'; probes: Probe[]; notice: string }
  | { kind: 'refusal'; where: 'add' | 'run'; text: string; errorClass: string }
  | { kind: 'hang'; detail: string }
  | { kind: 'crash' };

async function prepare(page: Page, tool: ToolSpec) {
  await page.addInitScript(() => {
    // The site skips analytics in automated browsers; pretend to be a person so the recording stub loads.
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    (window as unknown as { __events: unknown[] }).__events = [];
    // The tool announces its result files; keep them to look at (the event does not bubble, but a capturing listener sees it).
    window.addEventListener('stayput:done', (e) => ((window as unknown as { __outs: unknown }).__outs = (e as CustomEvent).detail), true);
  });
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  if (tool.speech) {
    await page.addInitScript(() => {
      // Safari would pick the GPU worker when WebGPU exists; the stand-in below is for the 8-bit worker only.
      Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined });
      const Real = window.Worker;
      class FakeWorker extends EventTarget {
        postMessage(msg: { id: number }) {
          setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start: 0, end: 1.5, text: 'Hello from the park' }], language: 'en' } })), 10);
        }
        terminate() {}
      }
      (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
        return /transcribe/.test(String(url)) ? new FakeWorker() : new Real(url, opts);
      };
    });
  }
}

/** Open each result file the way a person would: a picture decodes, a video loads, a sound decodes. */
function inspectOutputs(): Promise<Probe[]> {
  const outs = ((window as unknown as { __outs?: { name: string; blob: Blob }[] }).__outs ?? []).slice(0, 6);
  return Promise.all(
    outs.map(async ({ name, blob }): Promise<Probe> => {
      const ext = (name.split('.').pop() ?? '').toLowerCase();
      const base = { name, size: blob.size, kind: ext };
      if (blob.size === 0) return { ...base, problem: 'empty file' };
      try {
        if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext)) {
          const url = URL.createObjectURL(blob);
          const v = document.createElement('video');
          v.muted = true;
          v.preload = 'auto';
          v.src = url;
          const r = await new Promise<{ duration: number; width: number; height: number }>((ok, bad) => {
            v.onloadeddata = () => ok({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
            v.onerror = () => bad(new Error('the video does not open'));
            setTimeout(() => bad(new Error('the video does not load')), 15_000);
          });
          URL.revokeObjectURL(url);
          return r.width > 0 && r.height > 0 && r.duration > 0 ? { ...base, ...r } : { ...base, ...r, problem: 'the video has no picture or no length' };
        }
        // Safari on Linux cannot decode FLAC (decodeAudioData hangs or returns half), so there a good FLAC header is as far as a test can look.
        if (ext === 'flac' && !/Chrome/.test(navigator.userAgent)) {
          return new TextDecoder('latin1').decode((await blob.slice(0, 4).arrayBuffer()) as ArrayBuffer) === 'fLaC' ? base : { ...base, problem: 'not a FLAC file' };
        }
        if (['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus'].includes(ext)) {
          const ctx = new OfflineAudioContext(1, 1, 44100);
          const bytes = await blob.arrayBuffer();
          // Safari on Linux cannot decode FLAC at all, so for FLAC a good header is as far as a test there can look.
          const audio = await ctx.decodeAudioData(bytes.slice(0)).catch((e) => {
            if (ext === 'flac' && new TextDecoder('latin1').decode(bytes.slice(0, 4)) === 'fLaC') return { duration: 1 };
            throw e;
          });
          if (ext === 'flac' && !(audio.duration > 0) && new TextDecoder('latin1').decode(bytes.slice(0, 4)) === 'fLaC') return base;
          return audio.duration > 0 ? { ...base, duration: audio.duration } : { ...base, problem: 'the sound has no length' };
        }
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
          const bmp = await createImageBitmap(blob);
          return bmp.width > 0 && bmp.height > 0 ? { ...base, width: bmp.width, height: bmp.height } : { ...base, problem: 'the picture has no size' };
        }
        const head = new TextDecoder('latin1').decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
        if (ext === 'pdf') return head.startsWith('%PDF') ? base : { ...base, problem: 'not a PDF' };
        if (ext === 'zip') return head.startsWith('PK') ? base : { ...base, problem: 'not a zip' };
        return base;
      } catch (e) {
        return { ...base, problem: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}

async function attempt(page: Page, tool: ToolSpec, file: string, crashed: () => boolean): Promise<Outcome> {
  const guard = tool.slow ? SLOW_GUARD_MS : GUARD_MS;
  await page.goto(tool.path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  // Added, or refused on the spot.
  const added = await page
    .waitForFunction(() => document.getElementById('error')?.classList.contains('is-active') || Number(document.getElementById('tool')?.dataset.count) > 0, undefined, { timeout: 15_000 })
    .then(() => true, () => false);
  if (crashed()) return { kind: 'crash' };
  if (!added) return { kind: 'hang', detail: 'the file was neither added nor refused within 15 s' };
  const errorBox = page.locator('#error');
  const run = page.locator('#run');
  // A file refused the moment it is added (an empty one) never reaches Run; no run is recorded.
  await page.waitForTimeout(500);
  if ((await errorBox.evaluate((el) => el.classList.contains('is-active'))) && (await run.isDisabled())) {
    return { kind: 'refusal', where: 'add', text: (await errorBox.textContent()) ?? '', errorClass: '' };
  }
  // Tools that read the file as it is added (a PDF's pages, a picture's thumbnail) may take a moment to settle.
  await expect(run).toBeEnabled({ timeout: 15_000 });
  await tool.before?.(page);
  await run.click();
  const settled = await page
    .waitForFunction(
      () => {
        const el = (id: string) => document.getElementById(id);
        return el('results')?.classList.contains('is-active') || el('error')?.classList.contains('is-active');
      },
      undefined,
      { timeout: guard },
    )
    .then(() => true, () => false);
  if (crashed()) return { kind: 'crash' };
  if (!settled) return { kind: 'hang', detail: `no result and no error after ${guard / 1000} s; progress said "${(await page.locator('#progress-text').textContent().catch(() => '')) ?? ''}"` };
  // The tool shows the result or error box before it pushes its tool_run event, so wait for the event (a real missing one still ends up undefined).
  const lastRun = () => page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events.filter((e) => e.n === 'tool_run').at(-1)?.d);
  await expect.poll(async () => (await lastRun()) !== undefined, { timeout: 5_000 }).toBe(true).catch(() => undefined);
  const event = await lastRun();
  const failed = await errorBox.evaluate((el) => el.classList.contains('is-active'));
  if (failed && event?.outcome !== 'ok') {
    return { kind: 'refusal', where: 'run', text: (await errorBox.textContent()) ?? '', errorClass: event?.error_class ?? '' };
  }
  const probes = await page.evaluate(inspectOutputs);
  return { kind: 'output', probes, notice: failed ? ((await errorBox.textContent()) ?? '') : '' };
}

/** Throws the first way an outcome breaks the rules; returns what happened for the report. */
function judge(outcome: Outcome, sample: Sample, tool: ToolSpec): string {
  switch (outcome.kind) {
    case 'hang':
      throw new Error(`hang: ${outcome.detail}`);
    case 'crash':
      throw new Error('crash: the tab crashed');
    case 'refusal': {
      if (sample.want === 'output') throw new Error(`refused a good file (${outcome.errorClass || 'no class'}): ${outcome.text.slice(0, 160)}`);
      const text = outcome.text.trim();
      if (text.length < 12) throw new Error(`blank or unreadable error copy: "${text}"`);
      if (/undefined|\[object|NaN|Failed to execute|^[A-Za-z]*Error$/.test(text)) throw new Error(`error copy is not readable: "${text.slice(0, 160)}"`);
      if (outcome.where === 'run' && UNNAMED.has(outcome.errorClass)) throw new Error(`unnamed refusal (class "${outcome.errorClass}"): ${text.slice(0, 160)}`);
      if (sample.noSound && tool.needsSound && !['NoSoundTrack', 'UnsupportedCodec'].includes(outcome.errorClass)) throw new Error(`a video with no sound track is called ${outcome.errorClass || 'nothing'}, not NoSoundTrack: ${text.slice(0, 120)}`);
      return `refused at ${outcome.where}: ${outcome.errorClass || '(none)'} | ${text.replace(/\s+/g, ' ')}`;
    }
    case 'output': {
      if (sample.want === 'refusal') throw new Error(`wrong output: made ${outcome.probes.map((p) => `${p.name} (${p.size} B)`).join(', ') || 'nothing'} from a file that is not valid`);
      if (outcome.probes.length === 0) throw new Error('blank result: the page reported a result with no files');
      for (const p of outcome.probes) {
        if (p.problem && !(sample.opaque && p.size > 0 && /^(mp4|mov|m4v|webm|mkv)$/.test(p.kind))) throw new Error(`wrong output: ${p.name}: ${p.problem}`);
        if (p.size === 0) throw new Error(`blank result: ${p.name} is empty`);
      }
      const media = outcome.probes.find((p) => p.duration !== undefined);
      if (media && sample.seconds && tool.keepsLength && Math.abs(media.duration! - sample.seconds) > Math.max(0.35, sample.seconds * 0.2)) {
        throw new Error(`wrong output: ${media.name} is ${media.duration!.toFixed(2)} s, the input is ${sample.seconds} s`);
      }
      const picture = outcome.probes.find((p) => p.width && p.height);
      if (picture && sample.portrait && tool.keepsLength && picture.height! <= picture.width!) {
        throw new Error(`wrong output: ${picture.name} is ${picture.width}x${picture.height}, a turned clip should come out upright`);
      }
      return `output ${outcome.probes.map((p) => `${p.name} ${p.width ? `${p.width}x${p.height}` : ''} ${p.duration ? `${p.duration.toFixed(1)}s` : ''}`.trim()).join(', ')}`;
    }
  }
}

function define(tool: ToolSpec, sample: Sample, label: string, file: string) {
  test(`${tool.path} · ${label}`, async ({ page }, info) => {
    const known = sample.known ?? KNOWN[`${tool.path}|${label}`];
    if (known) test.fail(!known.browser || known.browser === info.project.name, known.item);
    if (sample.skip) test.skip(sample.skip.browser === info.project.name, sample.skip.why);
    test.setTimeout((tool.slow ? SLOW_GUARD_MS : GUARD_MS) + 50_000);
    let crashed = false;
    page.on('crash', () => (crashed = true));
    await prepare(page, tool);
    const outcome = await attempt(page, tool, file, () => crashed).catch((e: Error) => {
      if (crashed) return { kind: 'crash' } as Outcome;
      throw e;
    });
    info.annotations.push({ type: 'outcome', description: outcome.kind === 'hang' ? `hang` : judgeSafe(outcome, sample, tool) });
    judge(outcome, sample, tool);
  });
}
function judgeSafe(outcome: Outcome, sample: Sample, tool: ToolSpec): string {
  try {
    return judge(outcome, sample, tool);
  } catch (e) {
    return `FAIL ${(e as Error).message}`;
  }
}

for (const tool of TOOLS) {
  test.describe(tool.path, () => {
    for (const kind of tool.kinds) {
      for (const sample of SAMPLES[kind]) {
        const file = sample.file.startsWith('/') ? sample.file : edge(sample.file);
        const label = sample.file.split('/').pop()!;
        define(tool, sample, label, file);
      }
    }
  });
}

// Inputs too big to commit, made here. Each must end in a result or a named refusal, never a hang or a crashed tab.
test.describe('large inputs, made at test time', () => {
  test.describe.configure({ timeout: 150_000 });
  const pictureTools = TOOLS.filter((t) => t.kinds.includes('image'));
  for (const tool of pictureTools) {
    test(`${tool.path} · a 50 megapixel picture (8160x6120)`, async ({ page }, info) => {
      let crashed = false;
      page.on('crash', () => (crashed = true));
      await prepare(page, tool);
      const outcome = await attempt(page, { ...tool, slow: true }, await bigPng(8160, 6120, 'big-50mp.png'), () => crashed);
      info.annotations.push({ type: 'outcome', description: judgeSafe(outcome, { file: 'big', want: 'any' }, tool) });
      judge(outcome, { file: 'big', want: 'any' }, tool);
    });
    test(`${tool.path} · a 400 megapixel picture (20000x20000)`, async ({ page }, info) => {
      const known = KNOWN[`${tool.path}|a 400 megapixel picture (20000x20000)`];
      if (known) test.fail(!known.browser || known.browser === info.project.name, known.item);
      let crashed = false;
      page.on('crash', () => (crashed = true));
      await prepare(page, tool);
      const outcome = await attempt(page, { ...tool, slow: true }, await bigPng(20000, 20000, 'big-400mp.png'), () => crashed);
      info.annotations.push({ type: 'outcome', description: judgeSafe(outcome, { file: 'big', want: 'any' }, tool) });
      judge(outcome, { file: 'big', want: 'any' }, tool);
    });
  }
  for (const path of ['/tools/volume-booster', '/ogg-to-mp3']) {
    test(`${path} · 20 minutes of sound (a 38 MB WAV)`, async ({ page }, info) => {
      const tool = TOOLS.find((t) => t.path === path)!;
      let crashed = false;
      page.on('crash', () => (crashed = true));
      await prepare(page, tool);
      const sample: Sample = { file: 'long', want: 'any' };
      const outcome = await attempt(page, { ...tool, slow: true }, longWav(20 * 60, 16_000, 'long-20min.wav'), () => crashed);
      info.annotations.push({ type: 'outcome', description: judgeSafe(outcome, sample, tool) });
      judge(outcome, sample, tool);
    });
  }
});
