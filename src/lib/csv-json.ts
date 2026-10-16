/**
 * JSON to CSV and CSV to JSON, as plain functions so they run the same in a worker and in a unit
 * test. Parsing follows RFC 4180: quoted fields, "" for a quote, and line breaks inside quotes.
 * Nothing here touches the page, the network or any storage.
 */
import { UnreadableFile } from './input-error';

export type Delimiter = ',' | ';' | '\t' | '|';
export const DELIMITERS: Delimiter[] = [',', ';', '\t', '|'];
export type Direction = 'json-to-csv' | 'csv-to-json' | 'delimited';

/** A table: an optional header row, then rows of text cells. */
export interface Table {
  header: string[] | null;
  rows: string[][];
}

export const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** The direction a pasted or dropped text most likely wants: JSON starts with [ or {. */
export function detectDirection(text: string): Direction {
  const first = stripBom(text).trimStart()[0];
  return first === '[' || first === '{' ? 'json-to-csv' : 'csv-to-json';
}

/** An error in the visitor's data, with where in the text it was found. */
export class DataError extends UnreadableFile {
  constructor(
    message: string,
    /** The names of the lists to pick from, when the JSON holds several. */
    readonly arrays?: string[],
  ) {
    super(message);
  }
}

/** 1-based line and column of an offset in `text`. */
export function locate(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) {
    line++;
    last = i;
  }
  return { line, column: offset - last };
}

/**
 * Guess the delimiter from the start of the text: the candidate that appears (outside quotes) the
 * same non-zero number of times on the most lines. Ties go to comma, semicolon, tab, pipe.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = stripBom(text).slice(0, 64 * 1024);
  const counts = new Map<Delimiter, number[]>(DELIMITERS.map((d) => [d, [0]]));
  let inQuotes = false;
  let lines = 0;
  for (let i = 0; i < sample.length && lines < 30; i++) {
    const c = sample[i]!;
    if (c === '"') inQuotes = !inQuotes;
    else if (inQuotes) continue;
    else if (c === '\n') {
      lines++;
      for (const list of counts.values()) list.push(0);
    } else {
      const list = counts.get(c as Delimiter);
      if (list) list[list.length - 1]!++;
    }
  }
  let best: Delimiter = ',';
  let bestScore = 0;
  for (const [d, list] of counts) {
    const seen = new Map<number, number>();
    for (const n of list) if (n > 0) seen.set(n, (seen.get(n) ?? 0) + 1);
    const score = Math.max(0, ...seen.values());
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Parse CSV text into rows of cells. Blank lines are skipped, a final line break does not add a
 * row, and a quote in the middle of an unquoted field is kept as it is. A quoted field that never
 * closes is an error that names where it opened.
 */
export function parseCsv(input: string, delimiter: Delimiter = ','): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  const n = text.length;
  const delim = delimiter.charCodeAt(0);
  let row: string[] = [];
  // A row of one empty cell is a blank line and is skipped, unless the cell was written as "".
  let rowQuoted = false;
  const blank = (r: string[]) => r.length === 1 && r[0] === '' && !rowQuoted;
  let i = 0;
  while (i < n) {
    // One field.
    let value: string;
    const quoted = text.charCodeAt(i) === 34;
    if (quoted) {
      const opened = i;
      let out = '';
      let from = i + 1;
      for (;;) {
        const q = text.indexOf('"', from);
        if (q === -1) {
          const at = locate(text, opened);
          throw new DataError(`Line ${at.line}, column ${at.column}: a quoted value is never closed. Add the closing quote, or remove the opening one.`);
        }
        out += text.slice(from, q);
        if (text.charCodeAt(q + 1) === 34) {
          out += '"';
          from = q + 2;
        } else {
          i = q + 1;
          break;
        }
      }
      // Anything between the closing quote and the delimiter is kept as written.
      let end = i;
      while (end < n) {
        const c = text.charCodeAt(end);
        if (c === delim || c === 10 || c === 13) break;
        end++;
      }
      value = out + text.slice(i, end);
      i = end;
    } else {
      let end = i;
      while (end < n) {
        const c = text.charCodeAt(end);
        if (c === delim || c === 10 || c === 13) break;
        end++;
      }
      value = text.slice(i, end);
      i = end;
    }
    row.push(value);
    if (quoted) rowQuoted = true;
    const c = text.charCodeAt(i);
    if (i >= n) {
      // End of text.
    } else if (c === delim) {
      i++;
      // A delimiter at the very end of the text leaves one more, empty, field.
      if (i >= n) row.push('');
      continue;
    } else {
      // A line break: CRLF, LF or a lone CR.
      i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
    }
    if (!blank(row)) rows.push(row);
    row = [];
    rowQuoted = false;
  }
  if (row.length > 0 && !blank(row)) rows.push(row);
  return rows;
}

export interface CsvWriteOptions {
  delimiter: Delimiter;
  /** The line ending: CRLF is what Excel expects. */
  eol: '\r\n' | '\n';
}

/** Write rows as CSV: quote a cell with the delimiter, a quote, CR or LF in it, and double inner quotes. */
export function toCsv(rows: readonly (readonly string[])[], { delimiter, eol }: CsvWriteOptions): string {
  const needs = (cell: string) => cell.includes(delimiter) || cell.includes('"') || cell.includes('\n') || cell.includes('\r');
  const quote = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const lines: string[] = [];
  for (const row of rows) {
    // A row of one empty cell would read back as a blank line, which parsers skip.
    if (row.length === 1 && row[0] === '') lines.push('""');
    else lines.push(row.map((cell) => (needs(cell) ? quote(cell) : cell)).join(delimiter));
  }
  return lines.length === 0 ? '' : lines.join(eol) + eol;
}

type Json = unknown;
const isRecord = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isScalar = (v: Json): boolean => v === null || typeof v !== 'object';

export interface FlattenOptions {
  /** Write nested objects as dotted columns (user.name); off keeps them as JSON text in one cell. */
  flatten: boolean;
  /** Write an array of plain values as a;b;c rather than JSON text. */
  joinArrays: boolean;
}

/** A JSON value as one cell of text. */
export function cellOf(value: Json, joinArrays = false): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  if (joinArrays && Array.isArray(value) && value.every(isScalar)) return value.map((v) => (v === null ? '' : String(v))).join(';');
  return JSON.stringify(value);
}

/**
 * One object as column name to cell text. Nested objects become dotted names; a name that would
 * repeat an earlier one gets _2, _3, so no value is lost.
 */
export function flatten(obj: Record<string, Json>, { flatten: nest, joinArrays }: FlattenOptions): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: string) => {
    let name = key;
    for (let n = 2; Object.prototype.hasOwnProperty.call(out, name); n++) name = `${key}_${n}`;
    out[name] = value;
  };
  const walk = (value: Record<string, Json>, prefix: string) => {
    for (const [k, v] of Object.entries(value)) {
      const key = prefix + k;
      if (nest && isRecord(v) && Object.keys(v).length > 0) walk(v, key + '.');
      else put(key, cellOf(v, joinArrays));
    }
  };
  walk(obj, '');
  return out;
}

/** Top-level keys of an object that hold a non-empty list of objects or lists. */
export function listKeys(value: Json): string[] {
  if (!isRecord(value)) return [];
  return Object.keys(value).filter((k) => {
    const v = value[k];
    return Array.isArray(v) && v.length > 0 && v.every((x) => !isScalar(x));
  });
}

/**
 * Turn parsed JSON into a table. Accepts a list of objects, a list of lists, or one object that
 * holds a single list of objects (`which` picks one when it holds several); any other object is
 * a one-row table.
 */
export function jsonToTable(value: Json, options: FlattenOptions & { which?: string }): Table {
  let items: Json[];
  if (Array.isArray(value)) items = value;
  else if (isRecord(value)) {
    const keys = listKeys(value);
    const pick = options.which && keys.includes(options.which) ? options.which : keys.length === 1 ? keys[0] : undefined;
    if (keys.length > 1 && pick === undefined) {
      throw new DataError(`This JSON holds ${keys.length} lists (${keys.join(', ')}). Choose one under Which list, then convert again.`, keys);
    }
    items = pick === undefined ? [value] : (value[pick] as Json[]);
  } else {
    throw new DataError('This JSON is a single value, not a list or an object. Give it an array of objects, or one object.');
  }
  if (items.length === 0) throw new DataError('The JSON list is empty, so there is nothing to write.');

  if (items.every(Array.isArray)) {
    return { header: null, rows: (items as Json[][]).map((r) => r.map((v) => cellOf(v, options.joinArrays))) };
  }
  const columns = new Map<string, number>();
  const records: Record<string, string>[] = [];
  for (const item of items) {
    const rec = isRecord(item) ? flatten(item, options) : { value: cellOf(item, options.joinArrays) };
    for (const k of Object.keys(rec)) if (!columns.has(k)) columns.set(k, columns.size);
    records.push(rec);
  }
  const header = [...columns.keys()];
  return { header, rows: records.map((rec) => header.map((k) => rec[k] ?? '')) };
}

/** Where JSON text first stops being valid JSON, and what was expected there; null when it is valid. */
export function findJsonError(text: string): { offset: number; message: string } | null {
  let i = 0;
  const n = text.length;
  const fail = (message: string, at = i): never => {
    throw { offset: at, message };
  };
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) break;
      i++;
    }
  };
  const string = () => {
    const opened = i;
    i++;
    for (;;) {
      if (i >= n) fail('a quoted string is never closed', opened);
      const c = text.charCodeAt(i);
      if (c === 34) return void i++;
      if (c < 32) fail('a line break inside a quoted string; write it as \\n');
      i += c === 92 ? 2 : 1;
    }
  };
  const literal = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null/y;
  const value = (): void => {
    ws();
    if (i >= n) fail('the text ends where a value was expected');
    const c = text[i];
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      i++;
      ws();
      if (text[i] === close) return void i++;
      for (;;) {
        if (c === '{') {
          ws();
          if (text[i] !== '"') fail('expected a key in quotes');
          string();
          ws();
          if (text[i] !== ':') fail('expected a colon');
          i++;
        }
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === close) return void i++;
        fail(`expected a comma or a closing ${close}`);
      }
    }
    if (c === '"') return string();
    literal.lastIndex = i;
    const m = literal.exec(text);
    if (!m) fail('expected a value');
    i += m![0].length;
  };
  try {
    value();
    ws();
    if (i < n) fail('unexpected text after the end of the JSON');
    return null;
  } catch (e) {
    if (e && typeof e === 'object' && 'offset' in e) return e as { offset: number; message: string };
    return null;
  }
}

/** Parse JSON text: one document, or else newline-delimited JSON (one value per line). */
export function parseJson(input: string): Json {
  const text = stripBom(input);
  if (text.trim() === '') throw new DataError('There is nothing to read: the text is empty.');
  try {
    return JSON.parse(text);
  } catch (e) {
    const lines = text.split('\n');
    const filled = lines.map((l, k) => ({ l, k })).filter((x) => x.l.trim() !== '');
    // Several lines, and the first is a whole JSON value by itself: newline-delimited JSON.
    let ndjson = false;
    if (filled.length > 1) {
      try {
        JSON.parse(filled[0]!.l);
        ndjson = true;
      } catch {
        // The first line is only part of a value: one document spread over lines.
      }
    }
    if (ndjson) {
      const out: Json[] = [];
      for (const { l, k } of filled) {
        try {
          out.push(JSON.parse(l));
        } catch {
          const found = findJsonError(l);
          const col = found ? found.offset + 1 : 1;
          throw new DataError(`Line ${k + 1}, column ${col}: this is not valid JSON${found ? `: ${found.message}` : ''}.`);
        }
      }
      return out;
    }
    const found = findJsonError(text);
    if (found) {
      const at = locate(text, found.offset);
      throw new DataError(`Line ${at.line}, column ${at.column}: this is not valid JSON: ${found.message}.`);
    }
    throw new DataError(`This is not valid JSON: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
  }
}

export interface JsonToCsvJob extends FlattenOptions, CsvWriteOptions {
  which?: string;
}

/** JSON text to CSV text (no BOM; the caller adds it), with the table that was written. */
export function jsonToCsv(text: string, job: JsonToCsvJob): { text: string; table: Table } {
  const table = jsonToTable(parseJson(text), job);
  const all = table.header ? [table.header, ...table.rows] : table.rows;
  return { text: toCsv(all, job), table };
}

export interface CsvToJsonJob {
  /** Undefined detects it from the text. */
  delimiter?: Delimiter;
  headers: boolean;
  detectTypes: boolean;
  pretty: boolean;
}

/** A cell as a JSON value when it is plainly a number, true, false or null; leading zeros and 16+ digits stay text. */
export function typed(cell: string): string | number | boolean | null {
  const lower = cell.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null') return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(cell) && cell.replace(/\D/g, '').length < 16) {
    const n = Number(cell);
    if (Number.isFinite(n) && !Object.is(n, -0)) return n;
  }
  return cell;
}

/** Header names made unique (_2, _3) and non-empty (column_N). */
export function uniqueHeaders(names: readonly string[], width = names.length): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const raw = names[i] ?? '';
    const base = raw.trim() === '' ? `column_${i + 1}` : raw;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    out.push(name);
  }
  return out;
}

export interface CsvToJsonResult {
  text: string;
  delimiter: Delimiter;
  rows: number;
  columns: number;
  /** Rows that had fewer or more cells than the widest row, and were padded. */
  padded: number;
  header: string[] | null;
}

/** CSV text to JSON text: an array of objects with headers on, otherwise an array of arrays. */
export function csvToJson(text: string, job: CsvToJsonJob): CsvToJsonResult {
  const delimiter = job.delimiter ?? detectDelimiter(text);
  const parsed = parseCsv(text, delimiter);
  if (parsed.length === 0) throw new DataError('There is nothing to convert: the CSV has no rows.');
  const width = parsed.reduce((m, r) => Math.max(m, r.length), 0);
  const body = job.headers ? parsed.slice(1) : parsed;
  const header = job.headers ? uniqueHeaders(parsed[0]!, width) : null;
  let padded = 0;
  const value = (cell: string) => (job.detectTypes ? typed(cell) : cell);
  const records: unknown[] = [];
  for (const row of body) {
    if (row.length !== width) padded++;
    if (header) {
      const rec: Record<string, unknown> = {};
      for (let c = 0; c < width; c++) rec[header[c]!] = value(row[c] ?? '');
      records.push(rec);
    } else {
      const cells: unknown[] = [];
      for (let c = 0; c < width; c++) cells.push(value(row[c] ?? ''));
      records.push(cells);
    }
  }
  // A header row that is shorter than a data row is not ragged data, so it is not counted.
  const parts = records.map((r) => (job.pretty ? '  ' + JSON.stringify(r, null, 2).replace(/\n/g, '\n  ') : JSON.stringify(r)));
  const out = records.length === 0 ? '[]' : job.pretty ? `[\n${parts.join(',\n')}\n]` : `[${parts.join(',')}]`;
  return { text: out, delimiter, rows: records.length, columns: width, padded, header };
}


/** What separates cells in delimited text: a character, a run of 2+ spaces, or any run of spaces and tabs. */
export type InDelimiter = Delimiter | 'spaces' | 'whitespace';
/** What separates cells in the result: a character, or columns padded with spaces to line up. */
export type OutDelimiter = Delimiter | 'padded';

export interface DelimitedJob {
  /** Undefined detects it from the text. */
  from?: InDelimiter;
  to: OutDelimiter;
  eol: '\r\n' | '\n';
}

const isBreak = (c: number) => c === 10 || c === 13;

/**
 * Parse text whose columns are separated by runs of spaces. A cell may be quoted like in CSV to hold
 * spaces, a quote or a line break. With `spaces` a single space stays inside a cell and 2+ spaces
 * start the next one; with `whitespace` every run of spaces or tabs does. Blank lines are skipped.
 */
export function parseSpaced(input: string, mode: 'spaces' | 'whitespace'): string[][] {
  const text = stripBom(input);
  const n = text.length;
  const rows: string[][] = [];
  const blank = (c: number) => c === 32 || (mode === 'whitespace' && c === 9);
  // Where the run of blanks starting at `from` ends.
  const skip = (from: number) => {
    let k = from;
    while (k < n && blank(text.charCodeAt(k))) k++;
    return k;
  };
  /** The end of an unquoted cell starting at `from`. */
  const cellEnd = (from: number) => {
    let end = from;
    while (end < n && !isBreak(text.charCodeAt(end))) {
      if (!blank(text.charCodeAt(end))) {
        end++;
        continue;
      }
      const k = skip(end);
      if (k >= n || isBreak(text.charCodeAt(k)) || mode === 'whitespace' || k - end >= 2) break;
      end = k;
    }
    return end;
  };
  let i = 0;
  while (i < n && (isBreak(text.charCodeAt(i)) || blank(text.charCodeAt(i)))) i++;
  while (i < n) {
    const row: string[] = [];
    for (;;) {
      let value: string;
      if (text.charCodeAt(i) === 34) {
        const opened = i;
        let out = '';
        let from = i + 1;
        for (;;) {
          const q = text.indexOf('"', from);
          if (q === -1) {
            const at = locate(text, opened);
            throw new DataError(`Line ${at.line}, column ${at.column}: a quoted value is never closed. Add the closing quote, or remove the opening one.`);
          }
          out += text.slice(from, q);
          if (text.charCodeAt(q + 1) === 34) {
            out += '"';
            from = q + 2;
          } else {
            i = q + 1;
            break;
          }
        }
        const end = cellEnd(i);
        value = out + text.slice(i, end);
        i = end;
      } else {
        const end = cellEnd(i);
        value = text.slice(i, end);
        i = end;
      }
      row.push(value);
      i = skip(i);
      if (i >= n || isBreak(text.charCodeAt(i))) break;
    }
    rows.push(row);
    // Past the line break, and any blank lines after it.
    while (i < n && (isBreak(text.charCodeAt(i)) || blank(text.charCodeAt(i)))) i++;
  }
  return rows;
}

/** Write rows with columns padded to line up, two spaces apart; a cell that would not read back as one is quoted. */
export function toPadded(rows: readonly (readonly string[])[], eol: '\r\n' | '\n'): string {
  const needs = (cell: string) => cell === '' || cell.includes('"') || /[\r\n\t]|^ | $| {2}/.test(cell);
  const cells = rows.map((row) => row.map((cell) => (needs(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)));
  const widths: number[] = [];
  for (const row of cells) row.forEach((cell, c) => (widths[c] = Math.max(widths[c] ?? 0, cell.length)));
  const lines = cells.map((row) => row.map((cell, c) => (c === row.length - 1 ? cell : cell.padEnd(widths[c]! + 2))).join(''));
  return lines.length === 0 ? '' : lines.join(eol) + eol;
}

/** Whether the text holds a NUL byte near its start, which no text file has. */
const looksBinary = (text: string) => text.slice(0, 8192).includes('\0');

/** A plain-English name for the delimiter that was found, for "Looks tab-separated". */
export const DELIMITER_NAME: Record<InDelimiter, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe', spaces: 'space', whitespace: 'space' };

/** Delimited text to delimited text: read the cells with one delimiter and write them with another. */
export function delimitedToDelimited(text: string, job: DelimitedJob): { text: string; rows: string[][]; from: InDelimiter } {
  if (looksBinary(text)) throw new UnreadableFile('This file is not text: it holds binary data. Drop a .txt, .csv or .tsv file, or paste the text.');
  if (text.trim() === '') throw new DataError('There is nothing to convert: the text is empty.');
  const from = job.from ?? detectDelimiter(text);
  const rows = from === 'spaces' || from === 'whitespace' ? parseSpaced(text, from) : parseCsv(text, from);
  if (rows.length === 0) throw new DataError('There is nothing to convert: the text has no rows.');
  const out = job.to === 'padded' ? toPadded(rows, job.eol) : toCsv(rows, { delimiter: job.to, eol: job.eol });
  return { text: out, rows, from };
}

/** The result of a conversion in either direction, shaped for the page. */
export interface Converted {
  direction: Direction;
  text: string;
  rows: number;
  columns: number;
  padded: number;
  delimiter: Delimiter;
  /** Whether the first of `previewRows` is a header row. */
  hasHeader: boolean;
  /** First rows (header first, when there is one) of a CSV result. */
  previewRows: string[][];
  /** First lines of a JSON result. */
  previewLines: string[];
}

export const PREVIEW_ROWS = 20;
export const PREVIEW_LINES = 40;

export type Job =
  | ({ direction: 'json-to-csv' } & JsonToCsvJob)
  | ({ direction: 'csv-to-json' } & CsvToJsonJob)
  | ({ direction: 'delimited' } & DelimitedJob);

/** Run one conversion on the whole text. */
export function convert(text: string, job: Job): Converted {
  if (job.direction === 'json-to-csv') {
    const { text: csv, table } = jsonToCsv(text, job);
    const all = table.header ? [table.header, ...table.rows] : table.rows;
    return {
      direction: job.direction,
      text: csv,
      rows: table.rows.length,
      columns: all.reduce((m, r) => Math.max(m, r.length), 0),
      padded: 0,
      delimiter: job.delimiter,
      hasHeader: table.header !== null,
      previewRows: all.slice(0, PREVIEW_ROWS + (table.header ? 1 : 0)),
      previewLines: [],
    };
  }
  if (job.direction === 'delimited') {
    const r = delimitedToDelimited(text, job);
    const width = r.rows.reduce((m, row) => Math.max(m, row.length), 0);
    return {
      direction: job.direction,
      text: r.text,
      rows: r.rows.length,
      columns: width,
      padded: 0,
      delimiter: r.from === 'spaces' || r.from === 'whitespace' ? ',' : r.from,
      hasHeader: false,
      previewRows: r.rows.slice(0, PREVIEW_ROWS),
      previewLines: [],
    };
  }
  const r = csvToJson(text, job);
  const lines: string[] = [];
  for (let at = 0; lines.length < PREVIEW_LINES && at < r.text.length; ) {
    const nl = r.text.indexOf('\n', at);
    lines.push(r.text.slice(at, nl === -1 ? undefined : nl));
    if (nl === -1) break;
    at = nl + 1;
  }
  return { direction: job.direction, text: r.text, rows: r.rows, columns: r.columns, padded: r.padded, delimiter: r.delimiter, hasHeader: false, previewRows: [], previewLines: lines };
}
