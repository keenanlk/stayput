/** What a model file must be, from the build-time manifest (scripts/model-manifest.mjs). */
import manifest from '../data/model-manifest.json';
import type { ModelEntry } from './model-fetch';

const entries = manifest as Record<string, ModelEntry>;

/** The size and SHA-256 of the model file served at `url` (a path or an absolute URL on this site), or undefined for a file not in the manifest. */
export function modelEntry(url: string): ModelEntry | undefined {
  try {
    return entries[new URL(url, 'https://stayput.invalid').pathname];
  } catch {
    return undefined;
  }
}

/** Paths in the manifest under `prefix`. */
export const modelPaths = (prefix: string): string[] => Object.keys(entries).filter((p) => p.startsWith(prefix));
