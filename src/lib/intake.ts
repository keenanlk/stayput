/**
 * The check every file tool runs when a file is added: what the file really is, and whether it is on this device.
 * It reads only the first few KB (never the whole file) and says "no" only for a file that cannot work: a cloud
 * placeholder, or a container the tool has no reader for. Anything else passes and the tool decides, as before.
 * Free of vendor and codec imports so a spec can load it.
 */
import { NamedError } from './input-error';
import { isNotReadable, probeReadable, SNAPSHOT_LIMIT } from './read-failure';
import { SNIFF_BYTES, sniffBytes, type Container } from './sniff';

export interface IntakeProblem {
  /** The error class: UnsupportedContainer or FileNotDownloaded. */
  name: 'UnsupportedContainer' | 'FileNotDownloaded';
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

/** File types where a long run of zero bytes at the start is normal (disk images and raw dumps). */
const ZERO_HEAD_OK = /\.(iso|img|dmg|bin|dat|raw|tga|vhd|vhdx|vmdk)$/i;

const SAVE_STEPS =
  'Save it to this device first: in Google Photos or Drive, open the file, tap the three dots and choose Download (or Save to device); on a Chromebook, right-click it in the Files app and turn on "Available offline". Then pick the saved copy from the Downloads folder.';

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
    // A small file the browser cannot reach at byte 0, twice: a cloud file that is not on the device. A big one is left to the tool, which reads it in pieces and retries.
    if (!isNotReadable(e) || file.size > SNAPSHOT_LIMIT) return null;
    await new Promise((r) => setTimeout(r, 300));
    try {
      await probeReadable(file);
      return null;
    } catch {
      return { name: 'FileNotDownloaded', message: `${file.name} is not on this device yet: the browser cannot read it, which usually means it is still in the cloud. ${SAVE_STEPS}` };
    }
  }

  const container = sniffBytes(head);
  // A head shorter than the file claims is not a placeholder (a placeholder reads zeros for its whole length).
  if (container === 'zeros' && head.length >= Math.min(file.size, SNIFF_BYTES) && !ZERO_HEAD_OK.test(file.name)) {
    return { name: 'FileNotDownloaded', message: `${file.name} is empty on this device: every byte of it is zero, which usually means it is still in the cloud and only a placeholder was picked. ${SAVE_STEPS}` };
  }

  const fix = CONVERTERS[container];
  if (!fix || OWN_REFUSAL.has(tool) || OWN_REFUSAL.has(base) || !/(^|,)\s*video\//.test(accept)) return null;
  // A .wma is the same container as a .wmv: only a file named for video, or typed as video, is a WMV.
  const isWmv = /\.wmv$/i.test(file.name) || file.type === 'video/x-ms-wmv';
  if (container === 'asf' && !isWmv) return null;
  // The video-to-MP4 page reads AVI and FLV itself; no page reads WMV.
  if (container !== 'asf' && (LEGACY_READERS.has(tool) || LEGACY_READERS.has(base))) return null;
  return unsupported(file, fix);
}

function unsupported(file: File, fix: { label: string; text?: string; href?: string }): IntakeProblem {
  const message = fix.text
    ? `${file.name} is ${fix.label} file, and this tool cannot open that kind. Make an MP4 copy with ${fix.text}, then add the MP4 here.`
    : `${file.name} is ${fix.label} file, and this tool cannot open that kind. Make an MP4 copy with another converter, then add the MP4 here.`;
  return { name: 'UnsupportedContainer', message, link: fix.text && fix.href ? { text: fix.text, href: fix.href } : undefined };
}

/** The problem as an error, for code that would rather throw it. */
export function intakeError(p: IntakeProblem): Error {
  return new NamedError(p.name, p.message);
}
