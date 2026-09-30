import { test, expect } from '@playwright/test';
import { flowText, toChapters } from '../src/lib/epub-build';
import type { PageText } from '../src/lib/pdftext';

const body = (text: string) => ({ text, level: 0 as const });

test('flowText drops repeated headers and page numbers but keeps a line that repeats only twice', () => {
  const pages: PageText[] = [1, 2, 3, 4].map((n) => ({
    page: n,
    paragraphs: [body(`My Book · Chapter ${n}`), body(['The ship left at dawn.', 'Rain fell all day.', 'We reached the island.', 'Nobody slept that night.'][n - 1]!), body(n < 3 ? 'Signed, A.' : `End ${n}.`), body(String(n))],
  }));
  const out = flowText(pages).map((p) => p.text);
  expect(out).toEqual(['The ship left at dawn.', 'Signed, A.', 'Rain fell all day.', 'Signed, A.', 'We reached the island.', 'End 3.', 'Nobody slept that night.', 'End 4.']);
});

test('flowText joins a sentence split by a page break and mends stretched hyphens', () => {
  const pages: PageText[] = [
    { page: 1, paragraphs: [body('It began on a cold morning in the'), ] },
    { page: 2, paragraphs: [body('harbour, where the street- stalls opened late. First- and second-rate ones.')] },
  ];
  expect(flowText(pages).map((p) => p.text)).toEqual(['It began on a cold morning in the harbour, where the street-stalls opened late. First- and second-rate ones.']);
});

test('toChapters splits at main headings, falls back to subheadings, then to page ranges', () => {
  const p = (text: string, level: 0 | 1 | 2, page = 1) => ({ text, level, page });
  expect(toChapters([p('Preface text.', 0), p('One', 1), p('a', 0), p('Two', 1), p('b', 0)]).map((c) => c.title)).toEqual(['Opening', 'One', 'Two']);
  expect(toChapters([p('Title', 1), p('Part A', 2), p('a', 0), p('Part B', 2), p('b', 0)]).map((c) => c.title)).toEqual(['Opening', 'Part A', 'Part B']);
  expect(toChapters([p('a', 0, 1), p('b', 0, 21), p('c', 0, 45)]).map((c) => c.title)).toEqual(['Pages 1 to 20', 'Pages 21 to 40', 'Pages 41 to 45']);
});
