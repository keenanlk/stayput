import { test, expect } from '@playwright/test';
import {
  convert,
  csvToJson,
  detectDelimiter,
  detectDirection,
  flatten,
  jsonToCsv,
  jsonToTable,
  parseCsv,
  toCsv,
  typed,
  uniqueHeaders,
  DataError,
} from '../src/lib/csv-json';

const csv = (rows: string[][], delimiter: ',' | ';' | '\t' | '|' = ',') => toCsv(rows, { delimiter, eol: '\n' });
const opts = { flatten: true, joinArrays: false };

test('parseCsv reads quoted fields with commas, doubled quotes and line breaks inside them', () => {
  const text = 'name,note\n"Smith, Ada","said ""hi"""\n"two\nlines","a\r\nb"\n';
  expect(parseCsv(text)).toEqual([
    ['name', 'note'],
    ['Smith, Ada', 'said "hi"'],
    ['two\nlines', 'a\r\nb'],
  ]);
});

test('parseCsv takes CRLF, LF and CR line endings, a BOM, and a missing final newline alike', () => {
  const want = [['a', 'b'], ['1', '2'], ['3', '4']];
  expect(parseCsv('a,b\r\n1,2\r\n3,4\r\n')).toEqual(want);
  expect(parseCsv('a,b\n1,2\n3,4')).toEqual(want);
  expect(parseCsv('a,b\r1,2\r3,4')).toEqual(want);
  expect(parseCsv('﻿a,b\n1,2\n3,4\n')).toEqual(want);
});

test('parseCsv keeps empty cells, skips blank lines and keeps a quoted empty single value', () => {
  expect(parseCsv('a,b,c\n1,,3\n\n,,\n4,5,')).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['', '', ''], ['4', '5', '']]);
  expect(parseCsv('x\n""\ny\n')).toEqual([['x'], [''], ['y']]);
});

test('parseCsv keeps ragged rows as they are and a quote in the middle of a value as text', () => {
  expect(parseCsv('a,b,c\n1,2\n1,2,3,4\n5\'6,say "no"')).toEqual([['a', 'b', 'c'], ['1', '2'], ['1', '2', '3', '4'], ["5'6", 'say "no"']]);
});

test('parseCsv names the line and column of a quoted value that never closes', () => {
  expect(() => parseCsv('a,b\n1,"open\n2,3\n')).toThrowError(/Line 2, column 3: a quoted value is never closed/);
  try {
    parseCsv('"x');
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    expect((e as Error).name).toBe('UnreadableFile');
  }
});

test('detectDelimiter picks the delimiter that is steady across lines, and ignores ones inside quotes', () => {
  expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';');
  expect(detectDelimiter('a\tb\n1\t2\n')).toBe('\t');
  expect(detectDelimiter('a|b\n1|2\n')).toBe('|');
  expect(detectDelimiter('a,b\n"1,5;2",x\n')).toBe(',');
  expect(detectDelimiter('just one column\nof words\n')).toBe(',');
  expect(detectDelimiter('﻿a;b\n1;2')).toBe(';');
});

test('detectDirection reads JSON by its first character', () => {
  expect(detectDirection('  \n[{"a":1}]')).toBe('json-to-csv');
  expect(detectDirection('{"a":1}')).toBe('json-to-csv');
  expect(detectDirection('﻿[1]')).toBe('json-to-csv');
  expect(detectDirection('a,b\n1,2')).toBe('csv-to-json');
});

test('toCsv quotes only what needs it and writes the delimiter and line ending asked for', () => {
  expect(csv([['a', 'b,c', 'd"e', 'f\ng', ' h '], ['1', '', '2', '3', '4']])).toBe('a,"b,c","d""e","f\ng", h \n1,,2,3,4\n');
  expect(toCsv([['a;b', 'c']], { delimiter: ';', eol: '\r\n' })).toBe('"a;b";c\r\n');
  expect(csv([['a,b']], '\t')).toBe('a,b\n');
  expect(csv([['x'], [''], ['y']])).toBe('x\n""\ny\n');
});

test('flatten dots nested objects, keeps arrays as JSON or joins plain ones, and never drops a colliding key', () => {
  const value = { id: 1, user: { name: 'Ada', geo: { lat: 1.5 } }, tags: ['a', 'b'], mixed: [1, { x: 2 }], empty: {}, none: null };
  expect(flatten(value, opts)).toEqual({ id: '1', 'user.name': 'Ada', 'user.geo.lat': '1.5', tags: '["a","b"]', mixed: '[1,{"x":2}]', empty: '{}', none: '' });
  expect(flatten(value, { flatten: true, joinArrays: true })['tags']).toBe('a;b');
  expect(flatten(value, { flatten: true, joinArrays: true })['mixed']).toBe('[1,{"x":2}]');
  expect(flatten({ user: { name: 'Ada' } }, { flatten: false, joinArrays: false })).toEqual({ user: '{"name":"Ada"}' });
  expect(flatten({ 'a.b': 1, a: { b: 2 } }, opts)).toEqual({ 'a.b': '1', 'a.b_2': '2' });
});

test('jsonToTable takes the union of keys in first-seen order and fills missing ones with empty cells', () => {
  const t = jsonToTable([{ a: 1, b: 2 }, { b: 3, c: 4 }, { a: 5 }], opts);
  expect(t.header).toEqual(['a', 'b', 'c']);
  expect(t.rows).toEqual([['1', '2', ''], ['', '3', '4'], ['5', '', '']]);
});

test('jsonToTable accepts arrays of arrays, a wrapped list, one object and plain values', () => {
  expect(jsonToTable([[1, 'x'], [2, 'y']], opts)).toEqual({ header: null, rows: [['1', 'x'], ['2', 'y']] });
  expect(jsonToTable({ total: 2, items: [{ a: 1 }, { a: 2 }] }, opts).rows).toEqual([['1'], ['2']]);
  expect(jsonToTable({ name: 'Ada', tags: ['a'] }, opts)).toEqual({ header: ['name', 'tags'], rows: [['Ada', '["a"]']] });
  expect(jsonToTable([1, 'two', null], opts)).toEqual({ header: ['value'], rows: [['1'], ['two'], ['']] });
});

test('jsonToTable asks which list to use when an object holds several, and uses the one chosen', () => {
  const value = { users: [{ n: 'Ada' }], orders: [{ id: 7 }] };
  try {
    jsonToTable(value, opts);
    throw new Error('should have asked');
  } catch (e) {
    expect((e as DataError).arrays).toEqual(['users', 'orders']);
  }
  expect(jsonToTable(value, { ...opts, which: 'orders' }).rows).toEqual([['7']]);
});

test('jsonToCsv reads newline-delimited JSON, and reports the line and column of bad JSON', () => {
  const nd = jsonToCsv('{"a":1}\n{"a":2,"b":"x"}\n', { ...opts, delimiter: ',', eol: '\n' });
  expect(nd.text).toBe('a,b\n1,\n2,x\n');
  expect(() => jsonToCsv('[\n  {"a": 1},\n  {"a": }\n]', { ...opts, delimiter: ',', eol: '\n' })).toThrowError(/Line 3/);
  expect(() => jsonToCsv('{"a":1}\n{"a":}\n', { ...opts, delimiter: ',', eol: '\n' })).toThrowError(/Line 2, column 6/);
  expect(() => jsonToCsv('[{"a":1} {"a":2}]', { ...opts, delimiter: ',', eol: '\n' })).toThrowError(/Line 1, column 10: .*expected a comma or a closing \]/);
  expect(() => jsonToCsv('{"a": "oops', { ...opts, delimiter: ',', eol: '\n' })).toThrowError(/never closed/);
  expect(() => jsonToCsv('', { ...opts, delimiter: ',', eol: '\n' })).toThrowError(/nothing to read/);
  expect(() => jsonToCsv('[]', { ...opts, delimiter: ',', eol: '\n' })).toThrowError(/empty/);
  expect(() => jsonToCsv('42', { ...opts, delimiter: ',', eol: '\n' })).toThrowError(/single value/);
});

test('uniqueHeaders suffixes repeats with _2, _3 and names empty headers by position', () => {
  expect(uniqueHeaders(['id', 'name', 'id', '', 'id'])).toEqual(['id', 'name', 'id_2', 'column_4', 'id_3']);
  expect(uniqueHeaders(['a'], 3)).toEqual(['a', 'column_2', 'column_3']);
});

test('typed turns plain numbers, true, false and null into JSON values and leaves ids as text', () => {
  expect(['1', '-2.5', '1e3', '0', '0.5'].map(typed)).toEqual([1, -2.5, 1000, 0, 0.5]);
  expect(['true', 'FALSE', 'null'].map(typed)).toEqual([true, false, null]);
  expect(['007', '00123', '1234567890123456', '12345678901234567890', '1,5', '', ' 1', '-0', 'abc'].map(typed)).toEqual(['007', '00123', '1234567890123456', '12345678901234567890', '1,5', '', ' 1', '-0', 'abc']);
  expect(typed('123456789012345')).toBe(123456789012345);
});

test('csvToJson gives objects with headers, arrays without, and pads ragged rows and counts them', () => {
  const base = { headers: true, detectTypes: false, pretty: false };
  const r = csvToJson('id,name,id\n1,Ada,x\n2\n3,Bob,y,extra\n', base);
  expect(JSON.parse(r.text)).toEqual([
    { id: '1', name: 'Ada', id_2: 'x', column_4: '' },
    { id: '2', name: '', id_2: '', column_4: '' },
    { id: '3', name: 'Bob', id_2: 'y', column_4: 'extra' },
  ]);
  expect(r.padded).toBe(2);
  expect(r.rows).toBe(3);
  expect(r.columns).toBe(4);
  const arrays = csvToJson('a;b\n1;2\n', { ...base, headers: false });
  expect(arrays.delimiter).toBe(';');
  expect(JSON.parse(arrays.text)).toEqual([['a', 'b'], ['1', '2']]);
});

test('csvToJson keeps values as text by default and types them only when asked; pretty uses two spaces', () => {
  const text = 'id,n,ok,x\n00123,5,true,\n';
  expect(JSON.parse(csvToJson(text, { headers: true, detectTypes: false, pretty: false }).text)).toEqual([{ id: '00123', n: '5', ok: 'true', x: '' }]);
  expect(JSON.parse(csvToJson(text, { headers: true, detectTypes: true, pretty: false }).text)).toEqual([{ id: '00123', n: 5, ok: true, x: '' }]);
  expect(csvToJson('a\n1\n', { headers: true, detectTypes: false, pretty: true }).text).toBe('[\n  {\n    "a": "1"\n  }\n]');
  expect(csvToJson('a,b\n', { headers: true, detectTypes: false, pretty: true }).text).toBe('[]');
  expect(() => csvToJson('', { headers: true, detectTypes: false, pretty: true })).toThrowError(/no rows/);
});

test('JSON to CSV and back gives the data again, including quotes, newlines, commas and unicode', () => {
  const data = [
    { id: '1', name: 'Ada "Countess" Lovelace', note: 'line one\nline two', city: 'London, UK' },
    { id: '2', name: 'Zoë 山田', note: '', city: 'Tōkyō' },
    { id: '3', name: '=SUM(A1)', note: ' padded ', city: '' },
  ];
  for (const delimiter of [',', ';', '\t', '|'] as const) {
    for (const eol of ['\r\n', '\n'] as const) {
      const out = convert(JSON.stringify(data), { direction: 'json-to-csv', ...opts, delimiter, eol });
      expect(out.rows).toBe(3);
      expect(out.columns).toBe(4);
      const back = convert('﻿' + out.text, { direction: 'csv-to-json', delimiter: undefined, headers: true, detectTypes: false, pretty: false });
      expect(JSON.parse(back.text), `${JSON.stringify(delimiter)} ${JSON.stringify(eol)}`).toEqual(data);
    }
  }
});

test('a nested document survives a round trip as flattened rows, with arrays kept as JSON text', () => {
  const doc = [
    { id: 1, user: { name: 'Ada', roles: ['admin', 'dev'] }, active: true },
    { id: 2, user: { name: 'Bob', roles: [] }, active: false },
  ];
  const out = convert(JSON.stringify(doc), { direction: 'json-to-csv', ...opts, delimiter: ',', eol: '\n' });
  expect(out.text).toBe('id,user.name,user.roles,active\n1,Ada,"[""admin"",""dev""]",true\n2,Bob,[],false\n');
  const back = JSON.parse(convert(out.text, { direction: 'csv-to-json', headers: true, detectTypes: true, pretty: false }).text);
  expect(back).toEqual([
    { id: 1, 'user.name': 'Ada', 'user.roles': '["admin","dev"]', active: true },
    { id: 2, 'user.name': 'Bob', 'user.roles': '[]', active: false },
  ]);
});

test('convert previews the first 20 rows with the header, and the first 40 lines of JSON', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ n: i }));
  const a = convert(JSON.stringify(rows), { direction: 'json-to-csv', ...opts, delimiter: ',', eol: '\n' });
  expect(a.hasHeader).toBe(true);
  expect(a.previewRows).toHaveLength(21);
  expect(a.previewRows[0]).toEqual(['n']);
  const b = convert('n\n' + rows.map((r) => r.n).join('\n'), { direction: 'csv-to-json', headers: true, detectTypes: true, pretty: true });
  expect(b.previewLines).toHaveLength(40);
  expect(b.rows).toBe(50);
});
