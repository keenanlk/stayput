/**
 * Bulk rename: turn a list of file names into new names from a pattern.
 * Pure string work; the names never leave the tab.
 */
export interface RenameOptions {
  prefix: string;
  suffix: string;
  /** Number each file, counting from `start`. */
  number: boolean;
  start: number;
  /** Zero-pad the number to this many digits. */
  pad: number;
  /** Put the number before the name instead of after it. */
  numberFirst: boolean;
  find: string;
  replace: string;
  matchCase: boolean;
  casing: 'keep' | 'lower' | 'upper' | 'title';
  keepExtension: boolean;
}

export const defaultRename: RenameOptions = {
  prefix: '',
  suffix: '',
  number: false,
  start: 1,
  pad: 3,
  numberFirst: false,
  find: '',
  replace: '',
  matchCase: false,
  casing: 'keep',
  keepExtension: true,
};

/** Characters no common file system accepts in a name, plus control characters. */
const INVALID = /[\\/:*?"<>|\u0000-\u001f]/g;

export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(INVALID, '').replace(/^[\s.]+|[\s.]+$/g, '');
}

/** Split "a.tar.gz"-style names at the last dot; a leading dot is part of the name. */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s_\-.]+)(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

function replaceAllPlain(text: string, find: string, replace: string, matchCase: boolean): string {
  if (!find) return text;
  if (matchCase) return text.split(find).join(replace);
  const lower = text.toLowerCase();
  const needle = find.toLowerCase();
  // Lower-casing can change length for a few characters; fall back to case-sensitive then.
  if (lower.length !== text.length) return text.split(find).join(replace);
  let out = '';
  let at = 0;
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, at)) {
    out += text.slice(at, i) + replace;
    at = i + needle.length;
  }
  return out + text.slice(at);
}

export interface RenameRow {
  oldName: string;
  newName: string;
  /** This name was already taken by an earlier file, so a "-2" style counter was added. */
  adjusted: boolean;
}

/** New names for `names` in order. Duplicates (ignoring case) get "-2", "-3" ... before the extension. */
export function renameAll(names: string[], o: RenameOptions): RenameRow[] {
  const taken = new Set<string>();
  const start = Number.isFinite(o.start) ? Math.max(0, Math.floor(o.start)) : 1;
  const pad = Number.isFinite(o.pad) ? Math.min(12, Math.max(0, Math.floor(o.pad))) : 0;
  return names.map((oldName, i) => {
    const { base, ext } = o.keepExtension ? splitName(oldName) : { base: oldName, ext: '' };
    let stem = replaceAllPlain(base, o.find, o.replace, o.matchCase);
    if (o.casing === 'lower') stem = stem.toLowerCase();
    else if (o.casing === 'upper') stem = stem.toUpperCase();
    else if (o.casing === 'title') stem = titleCase(stem);
    if (o.number) {
      const n = String(start + i).padStart(pad, '0');
      stem = o.numberFirst ? `${n}${stem ? ' ' + stem : ''}` : `${stem}${stem ? ' ' : ''}${n}`;
    }
    stem = cleanName(`${o.prefix}${stem}${o.suffix}`);
    const cleanExt = cleanName(ext.replace(/^\./, ''));
    const make = (s: string) => (cleanExt ? `${s || 'file'}.${cleanExt}` : s || 'file');
    let name = make(stem);
    let adjusted = false;
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      adjusted = true;
      name = make(`${stem || 'file'}-${n}`);
    }
    taken.add(name.toLowerCase());
    return { oldName, newName: name, adjusted };
  });
}
