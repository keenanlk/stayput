import { test, expect } from '@playwright/test';
import { inlineLinks, plainLinks } from '../src/lib/inline';

test('FAQ answers turn site-relative [text](/path) into links', () => {
  expect(inlineLinks('Use the [image converter](/tools/convert-image) instead.')).toBe(
    'Use the <a href="/tools/convert-image">image converter</a> instead.',
  );
});

test('FAQ answers escape other markup and refuse non-relative link targets', () => {
  expect(inlineLinks('<b>x</b> & **y**')).toBe('&lt;b&gt;x&lt;/b&gt; &amp; **y**');
  expect(inlineLinks('[a](javascript:alert(1))')).not.toContain('<a ');
  expect(inlineLinks('[a](https://example.com)')).not.toContain('<a ');
  expect(inlineLinks('[a](//example.com)')).not.toContain('<a ');
  expect(inlineLinks('[a](/x"onmouseover="y)')).not.toContain('"onmouseover');
});

test('structured data keeps only the link text', () => {
  expect(plainLinks('See [the tool](/tools/x) now.')).toBe('See the tool now.');
});
