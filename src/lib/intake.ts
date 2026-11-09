/**
 * The check every file tool runs when a file is added: what the file really is, and whether it is on this device.
 * It reads only the first few KB (never the whole file) and says "no" only for a file that cannot work: a cloud
 * placeholder, or a container the tool has no reader for. Anything else passes and the tool decides, as before.
 * Free of vendor and codec imports so a spec can load it.
 */
import { NamedError } from './input-error';
import { isNotReadable, notReadable, probeReadable, SNAPSHOT_LIMIT } from './read-failure';
import { SNIFF_BYTES, kindOf, sniffBytes, type Container } from './sniff';
import { labelOf } from './unreadable';

export interface IntakeProblem {
  /**
   * The error class: UnsupportedContainer or FileNotDownloaded; NotReadableProbe for a file whose start reads but whose end or middle does not;
   * UnreadableFileGone for a file that was refused before and is added again; NotAVideoContainer or NotAnAudioFile for a file that is no video or
   * sound. (Pictures, GIFs, PDFs and archives are not refused here: a batch tool skips its bad file and does the rest, so each of those names its cause
   * when its file is read.)
   */
  name: 'UnsupportedContainer' | 'FileNotDownloaded' | 'NotReadableProbe' | 'UnreadableFileGone' | 'NotAVideoContainer' | 'NotAnAudioFile';
  message: string;
  /** One phrase of the message that links to a page that fixes it. */
  link?: { text: string; href: string };
}

/** Where to send a container this tool cannot read. Only pages that are live are listed. */
const CONVERTERS: Partial<Record<Container, { label: string; text?: string; href?: string }>> = {
  avi: { label: 'an AVI', text: 'AVI to MP4', href: '/avi-to-mp4' },
  flv: { label: 'an FLV', text: 'FLV to MP4', href: '/flv-to-mp4' },
  asf: { label: 'a WMV' },
};

/** Tools that read old containers themselves (the libav paths): the video-to-MP4 page and its AVI, FLV and 3GP pages. */
const LEGACY_READERS = new Set(['video-to-mp4']);

/** Tools that already refuse these containers themselves, with a message of their own, once Run is pressed. */
const OWN_REFUSAL = new Set(['video-background-remover']);

/** Tools that read the start of the file themselves when it is added and say what is wrong with it in their own words (the splitters). */
const OWN_EARLY_CHECK = new Set(['video-splitter', 'split-video']);

/** File types where a long run of zero bytes at the start is normal (disk images and raw dumps). */
const ZERO_HEAD_OK = /\.(iso|img|dmg|bin|dat|raw|tga|vhd|vhdx|vmdk)$/i;

const SAVE_STEPS =
  'Save it to this device first: in Google Photos or Drive, open the file, tap the three dots and choose Download (or Save to device). On a Chromebook, right-click it in the Files app and turn on "Available offline". On an iPhone or iPad, open it in the Files app and tap the cloud icon to download it. Then add the saved copy here.';

/** Whether a tool's file input takes audio or video: the tools whose files are checked end to end at add time and copied at Run (input-copy.ts). */
export function takesMedia(accept: string): boolean {
  return /(^|,)\s*(audio|video)\//.test(accept);
}

const MEDIA_EXT = /\.(mp4|m4v|mov|qt|webm|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpe?g|ogv|mp3|wav|m4a|m4b|aac|ogg|oga|opus|flac|aiff?|aifc|wma|amr|mid|midi|caf|weba)$/i;

/** Whether a picked file is itself audio or video (a tool that takes pictures and a song, like the slideshow maker, is not about to read its photos end to end). */
export function isMediaFile(file: File): boolean {
  return file.type.startsWith('audio/') || file.type.startsWith('video/') || (!/^(image|text)\//.test(file.type) && MEDIA_EXT.test(file.name));
}

/** Whether the first bytes are plain text: no NUL bytes and almost all of them printable. */
function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return false;
  let odd = 0;
  for (const b of head) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) odd++;
  }
  return odd / head.length < 0.02;
}

function readFirst(file: Blob): Promise<Uint8Array> {
  return file.slice(0, SNIFF_BYTES).arrayBuffer().then((b) => new Uint8Array(b));
}

/**
 * Looks at one picked file. `accept` is the tool's file input accept list and `tool`/`base` its slug and the slug of the tool it is a
 * preset of. Resolves to the problem to show before Run, or null when the file may go ahead.
 */
export async function inspectFile(file: File, tool: string, base: string, accept: string): Promise<IntakeProblem | null> {
  let head: Uint8Array;
  try {
    head = await readFirst(file);
  } catch (e) {
    // A file the browser cannot reach at byte 0, twice: a cloud file that is not on the device, or (a big video on Android) one the phone moved. Said now, before Run, with the steps to save it.
    if (!isNotReadable(e)) return null;
    await new Promise((r) => setTimeout(r, 300));
    try {
      await probeReadable(file);
      return null;
    } catch (again) {
      // The same File failed here before and still does: it will not come back, so say to pick it again.
      if ((again as { name?: string }).name === 'UnreadableFileGone') return { name: 'UnreadableFileGone', message: (again as Error).message };
      return { name: 'FileNotDownloaded', message: `${file.name} cannot be read by the browser, which usually means it is still in the cloud and not saved on this device yet. ${SAVE_STEPS}` };
    }
  }

  // An audio or video file is reached end to end now, once: its first byte, then its last (a last byte alone out of reach is let go if the
  // middle reads). A file the browser cannot reach is refused here, with the same words a failed run would give, and Run stays off for it.
  if (takesMedia(accept) && isMediaFile(file)) {
    try {
      await probeReadable(file);
    } catch (e) {
      if ((e as { name?: string }).name === 'UnreadableFileGone') return { name: 'UnreadableFileGone', message: (e as Error).message };
      if (isNotReadable(e)) return { name: 'NotReadableProbe', message: notReadable().message };
    }
  }

  const container = sniffBytes(head);
  // A head shorter than the file claims is not a placeholder, and a big file is left to the tool (it reads in pieces and says what failed).
  if (container === 'zeros' && file.size <= SNAPSHOT_LIMIT && head.length >= Math.min(file.size, SNIFF_BYTES) && !ZERO_HEAD_OK.test(file.name)) {
    return { name: 'FileNotDownloaded', message: `${file.name} looks empty on this device, which usually means it is still in the cloud and only a placeholder was picked. ${SAVE_STEPS}` };
  }

  // A file that is empty, or plainly another kind of file than the tool takes, is refused now and named for what it is (by its first bytes, not its name).
  const wrong = OWN_REFUSAL.has(tool) || OWN_REFUSAL.has(base) || OWN_EARLY_CHECK.has(tool) || OWN_EARLY_CHECK.has(base) ? null : wrongAtAdd(file, head, container, accept);
  if (wrong) return wrong;

  const fix = CONVERTERS[container];
  if (!fix || OWN_REFUSAL.has(tool) || OWN_REFUSAL.has(base) || !/(^|,)\s*video\//.test(accept)) return null;
  // A .wma is the same container as a .wmv: only a file named for video, or typed as video, is a WMV.
  const isWmv = !/\.wma$/i.test(file.name) && !file.type.startsWith('audio/');
  if (container === 'asf' && !isWmv) return null;
  // The video-to-MP4 page reads AVI and FLV itself; no page reads WMV.
  if (container !== 'asf' && (LEGACY_READERS.has(tool) || LEGACY_READERS.has(base))) return null;
  return unsupported(file, fix);
}

function wrongAtAdd(file: File, head: Uint8Array, container: Container, accept: string): IntakeProblem | null {
  // (An empty file never gets here: the shell refuses it when it is picked.)
  if (!takesMedia(accept) || !isMediaFile(file)) return null;
  const video = /(^|,)\s*video\//.test(accept);
  const kind = kindOf(container);
  // Pictures, PDFs, archives and plain text are no video and no sound. (A tool that takes pictures and a song is not about to refuse its photos.)
  const notMedia = kind === 'image' || container === 'pdf' || container === 'zip' || (container === 'unknown' && looksLikeText(head));
  if (!notMedia) return null;
  if (video) return { name: 'NotAVideoContainer', message: 'This file is not a video this page can read (MP4, MOV, WebM or MKV).' };
  return { name: 'NotAnAudioFile', message: "This file doesn't look like a recording or a video. Choose an audio or video file (MP3, M4A, WAV, MP4, MOV, WebM and so on)." };
}

function unsupported(file: File, fix: { label: string; text?: string; href?: string }): IntakeProblem {
  const message = fix.text
    ? `${file.name} is ${fix.label} file, which this tool cannot open. Make an MP4 copy with ${fix.text}, then add the MP4 here.`
    : `${file.name} is ${fix.label} file, which this tool cannot open. Make an MP4 copy with another converter, then add the MP4 here.`;
  return { name: 'UnsupportedContainer', message, link: fix.text && fix.href ? { text: fix.text, href: fix.href } : undefined };
}

/** The problem as an error, for code that would rather throw it. */
export function intakeError(p: IntakeProblem): Error {
  return new NamedError(p.name, p.message);
}
