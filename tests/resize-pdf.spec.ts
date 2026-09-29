import { test, expect } from '@playwright/test';
import { planPage } from '../src/lib/paper';

const a4 = { x: 0, y: 0, width: 595.28, height: 841.89 };
const letter = { x: 0, y: 0, width: 612, height: 792 };

test('A4 onto US Letter shrinks to 94% and centres with bands at the sides', () => {
  const p = planPage(a4, 0, { size: 'letter', orientation: 'auto', margin: 0 });
  expect([p.width, p.height]).toEqual([612, 792]);
  expect(p.scale).toBeCloseTo(792 / 841.89, 4);
  expect(p.dy).toBeCloseTo(0, 4);
  expect(p.dx).toBeCloseTo((612 - 595.28 * p.scale) / 2, 4);
});

test('Letter onto A4 shrinks to 97% with bands top and bottom', () => {
  const p = planPage(letter, 0, { size: 'a4', orientation: 'auto', margin: 0 });
  expect(p.scale).toBeCloseTo(595.28 / 612, 4);
  expect(p.dx).toBeCloseTo(0, 4);
  expect(p.dy).toBeGreaterThan(10);
});

test('landscape pages stay landscape, rotated pages are measured as shown, and margins shrink the content', () => {
  const wide = planPage({ x: 0, y: 0, width: 842, height: 595 }, 0, { size: 'letter', orientation: 'auto', margin: 0 });
  expect([wide.width, wide.height]).toEqual([792, 612]);
  // A portrait page shown sideways by /Rotate 90 is landscape on screen, so the new paper is too.
  const turned = planPage(a4, 90, { size: 'letter', orientation: 'auto', margin: 0 });
  expect([turned.width, turned.height]).toEqual([612, 792]);
  const forced = planPage(a4, 0, { size: 'letter', orientation: 'landscape', margin: 0 });
  expect([forced.width, forced.height]).toEqual([792, 612]);
  const m = planPage(letter, 0, { size: 'letter', orientation: 'auto', margin: 36 });
  expect(m.scale).toBeCloseTo((612 - 72) / 612, 4);
  // An offset crop box lands at the margin, not at its old coordinates.
  const off = planPage({ x: 100, y: 50, width: 612, height: 792 }, 0, { size: 'letter', orientation: 'auto', margin: 0 });
  expect(off.dx + 100 * off.scale).toBeCloseTo(0, 4);
  expect(off.dy + 50 * off.scale).toBeCloseTo(0, 4);
});
