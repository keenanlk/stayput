/**
 * MD5, SHA-1 and SHA-256 of a file, computed in the tab. WebCrypto has no MD5
 * and its digest() needs the whole file in memory, so this streams the file
 * through hash-wasm (MIT), served from /vendor/, one slice at a time.
 */
import { vendorEntry } from './vendor';

export const ALGORITHMS = [
  { id: 'md5', label: 'MD5', hexLength: 32 },
  { id: 'sha1', label: 'SHA-1', hexLength: 40 },
  { id: 'sha256', label: 'SHA-256', hexLength: 64 },
] as const;
export type AlgorithmId = (typeof ALGORITHMS)[number]['id'];
export type Digests = Record<AlgorithmId, string>;

/** Bytes read from the file at a time; the only part of it held in memory. */
export const CHUNK_BYTES = 8 * 1024 * 1024;

interface Hasher {
  init(): Hasher;
  update(data: Uint8Array): Hasher;
  digest(encoding: 'hex'): string;
}
interface HashWasm {
  createMD5(): Promise<Hasher>;
  createSHA1(): Promise<Hasher>;
  createSHA256(): Promise<Hasher>;
}

let loading: Promise<HashWasm> | undefined;
function library(): Promise<HashWasm> {
  loading ??= (import(/* @vite-ignore */ vendorEntry('hash')) as Promise<HashWasm>).catch((e) => {
    loading = undefined;
    throw new Error('The hashing code could not be loaded. Check your connection and try again.', { cause: e });
  });
  return loading;
}

/** Turns a failure while reading or hashing into a sentence for the person who dropped the file. */
export function describeHashError(e: unknown): Error {
  const name = e instanceof Error ? e.name : '';
  const text = e instanceof Error ? e.message : String(e);
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'SecurityError') {
    return new Error('The file could not be read. It may have been moved, renamed or changed while it was being checked, or it is on a drive that is no longer connected. Drop it again to retry.');
  }
  if (e instanceof RangeError || /memory|abort|allocation/i.test(text)) {
    return new Error('This device ran out of memory while checking the file. Close other tabs and try again, or use a computer with more memory. On Windows, certutil -hashfile or Get-FileHash can check it without the browser.');
  }
  return e instanceof Error ? e : new Error(text);
}

/** Hashes the file in CHUNK_BYTES slices. `onProgress` gets the fraction read so far. */
export async function hashFile(file: File, onProgress: (fraction: number) => void = () => {}): Promise<Digests> {
  const lib = await library();
  try {
    const hashers = await Promise.all([lib.createMD5(), lib.createSHA1(), lib.createSHA256()]);
    for (const h of hashers) h.init();
    let read = 0;
    while (read < file.size) {
      const chunk = new Uint8Array(await file.slice(read, read + CHUNK_BYTES).arrayBuffer());
      if (chunk.length === 0) throw new Error('The file ended earlier than expected. It may have changed while it was being checked. Drop it again to retry.');
      for (const h of hashers) h.update(chunk);
      read += chunk.length;
      onProgress(read / file.size);
    }
    return { md5: hashers[0]!.digest('hex'), sha1: hashers[1]!.digest('hex'), sha256: hashers[2]!.digest('hex') };
  } catch (e) {
    throw describeHashError(e);
  }
}

export type Comparison =
  | { kind: 'empty' }
  | { kind: 'match'; algorithm: (typeof ALGORITHMS)[number]; index: number }
  | { kind: 'mismatch'; algorithm?: (typeof ALGORITHMS)[number]; note: string };

/**
 * Compares a pasted checksum with the computed ones of each file. Case and
 * whitespace do not matter, and a `sha256sum`-style line ("<hash>  name") works
 * because every whitespace-separated word is tried as well as the whole text.
 */
export function compareChecksum(pasted: string, files: Digests[]): Comparison {
  const joined = pasted.replace(/\s+/g, '').toLowerCase();
  if (!joined) return { kind: 'empty' };
  const candidates = new Set([joined, ...pasted.toLowerCase().split(/\s+/).filter(Boolean)]);
  for (const [index, digests] of files.entries()) {
    for (const algorithm of ALGORITHMS) {
      if (candidates.has(digests[algorithm.id])) return { kind: 'match', algorithm, index };
    }
  }
  const algorithm = /^[0-9a-f]+$/.test(joined) ? ALGORITHMS.find((a) => a.hexLength === joined.length) : undefined;
  if (algorithm) return { kind: 'mismatch', algorithm, note: `That looks like a ${algorithm.label} checksum, and it does not match the ${algorithm.label} of ${files.length === 1 ? 'this file' : 'any of these files'}.` };
  return { kind: 'mismatch', note: 'That is not the right length or characters for an MD5 (32), SHA-1 (40) or SHA-256 (64) checksum. Check that you copied all of it.' };
}
