import { createShell } from '../lib/shell';
import { trackToolRun } from '../lib/analytics';
import { LAYOUTS, NAV, NUMPAD, allCodes, shouldSwallow, type KeyDef, type LayoutName } from '../lib/keyboard-tester';

/**
 * Keyboard tester. Key events are read in the page and drawn on the page; the
 * key, its code and the log stay in this tab's memory. Only one usage event is
 * sent, and it carries nothing about what was pressed.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const board = $('kbd-board');
const logEl = $('kbd-log');
const countEl = $('kbd-count');
const lastKey = $('kbd-last-key');
const lastCode = $('kbd-last-code');
const MAX_LOG = 100;

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

const tested = new Set<string>();
const down = new Set<string>();
let layout: LayoutName = 'ansi';
let tracked = false;

function block(rows: KeyDef[][]) {
  const el = document.createElement('div');
  el.className = 'kbd-block';
  for (const row of rows) {
    const r = document.createElement('div');
    r.className = 'kbd-row';
    for (const key of row) {
      const d = document.createElement('div');
      d.style.setProperty('--w', String(key.gap ?? key.w ?? 1));
      if (key.gap) d.className = 'kbd-gap';
      else {
        d.className = 'kbd-key';
        d.dataset.code = key.code;
        d.textContent = key.label;
      }
      r.append(d);
    }
    el.append(r);
  }
  return el;
}

function keyEl(code: string) {
  return board.querySelector<HTMLElement>(`[data-code="${CSS.escape(code)}"]`);
}

function paintKey(code: string) {
  const el = keyEl(code);
  if (!el) return;
  el.classList.toggle('is-tested', tested.has(code));
  el.classList.toggle('is-down', down.has(code));
}

function count() {
  const total = allCodes(layout).length;
  const n = [...tested].filter((c) => keyEl(c)).length;
  countEl.textContent = `${n} of ${total} keys tested`;
}

function render() {
  board.replaceChildren(block(LAYOUTS[layout]), block(NAV), block(NUMPAD));
  for (const c of tested) paintKey(c);
  for (const c of down) paintKey(c);
  count();
}

function reset() {
  tested.clear();
  down.clear();
  logEl.replaceChildren();
  lastKey.textContent = 'none yet';
  lastCode.textContent = 'none yet';
  render();
}

const show = (key: string) => (key === ' ' ? 'Space (" ")' : key === '' ? '(empty)' : key);

function isControl(t: EventTarget | null) {
  return t instanceof HTMLElement && !!t.closest('button, input, select, textarea, a, summary, [contenteditable]');
}

document.addEventListener('keydown', (e) => {
  // Space, Enter and the like must keep working on a focused button or radio.
  if (!isControl(e.target) && shouldSwallow(e)) e.preventDefault();
  if (e.repeat) {
    return;
  }
  if (e.target instanceof HTMLElement && e.target.closest('input[type="text"], textarea, [contenteditable]')) return;
  const code = e.code || e.key;
  tested.add(code);
  down.add(code);
  paintKey(code);
  count();
  lastKey.textContent = show(e.key);
  lastCode.textContent = code;
  const li = document.createElement('li');
  li.textContent = `key: ${show(e.key)}   code: ${code}`;
  logEl.prepend(li);
  while (logEl.childElementCount > MAX_LOG) logEl.lastElementChild?.remove();
  if (!tracked) {
    tracked = true;
    // The usual single usage event: no key, code or count in it.
    trackToolRun({ tool: root.dataset.slug ?? 'keyboard-tester', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0 });
    root.dispatchEvent(new CustomEvent('stayput:done'));
  }
});

document.addEventListener('keyup', (e) => {
  const code = e.code || e.key;
  down.delete(code);
  paintKey(code);
});

// A key released while the window had no focus (Cmd+Tab) never sends keyup.
window.addEventListener('blur', () => {
  for (const c of [...down]) {
    down.delete(c);
    paintKey(c);
  }
});

$('kbd-reset').addEventListener('click', reset);
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="kbd-layout"]')) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    layout = input.value as LayoutName;
    render();
  });
}

render();
