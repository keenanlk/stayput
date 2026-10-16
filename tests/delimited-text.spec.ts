import { test, expect } from '@playwright/test';
import { delimitedToDelimited, parseSpaced, DataError, type DelimitedJob } from '../src/lib/csv-json';

// Cells with the three things that need quoting: the delimiter, a double quote and a line break.
const rows = [
  ['id', 'name', 'note'],
  ['1', 'Hopper, Grace', 'said "debug it"'],
  ['2', 'Ada Lovelace', 'line one\nline two'],
  ['3', 'semi;colon', 'pipe|bar'],
  ['4', '', 'tab\there'],
];

const job = (from: DelimitedJob['from'], to: DelimitedJob['to']): DelimitedJob => ({ from, to, eol: '\n' });

for (const [name, d] of [['tab', '\t'], ['semicolon', ';'], ['pipe', '|'], ['comma', ',']] as const) {
  test(`${name}-separated text round-trips to CSV and back`, () => {
    // CSV -> TXT -> CSV -> TXT gives the same text, and the cells survive.
    const first = delimitedToDelimited(csvOf(rows), job(',', d)).text;
    const csv = delimitedToDelimited(first, job(undefined, ',')).text;
    expect(delimitedToDelimited(csv, job(',', d)).text).toBe(first);
    expect(delimitedToDelimited(csv, job(',', ',')).rows).toEqual(rows);
  });
}

test('2+ spaces: padded text round-trips, a single space stays inside a cell', () => {
  const padded = delimitedToDelimited(csvOf(rows), job(',', 'padded')).text;
  expect(padded.split('\n')[0]).toBe('id  name           note');
  expect(parseSpaced(padded, 'spaces')).toEqual(rows);
  const csv = delimitedToDelimited(padded, job('spaces', ',')).text;
  expect(delimitedToDelimited(csv, job(',', ',')).rows).toEqual(rows);
  expect(parseSpaced('Corner Cafe   lunch out  18.40\n\n  x  y \n', 'spaces')).toEqual([['Corner Cafe', 'lunch out', '18.40'], ['x', 'y']]);
  expect(parseSpaced('a b\t c  d', 'whitespace')).toEqual([['a', 'b', 'c', 'd']]);
});

test('a tab-separated sample reads as a comma CSV with quoting', () => {
  const out = delimitedToDelimited('date\tnote\n10-02\tlunch, two\n10-03\tBooks "R" Us\n', job(undefined, ',')).text;
  expect(out).toBe('date,note\n10-02,"lunch, two"\n10-03,"Books ""R"" Us"\n');
});

test('empty text and binary data get named errors', () => {
  for (const text of ['', '   \n\n  ']) {
    let err: unknown;
    try {
      delimitedToDelimited(text, job(undefined, ','));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DataError);
    expect((err as Error).name).toBe('UnreadableFile');
    expect((err as Error).message).toMatch(/nothing to convert/);
  }
  expect(() => delimitedToDelimited('PK\u0003\u0004\0\0binary', job(undefined, ','))).toThrow(/not text/);
  expect(() => parseSpaced('a  "b', 'spaces')).toThrow(/never closed/);
});

function csvOf(r: string[][]): string {
  return delimitedToDelimited(r.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), job(',', ',')).text;
}
