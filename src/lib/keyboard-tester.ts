/**
 * Keyboard layouts for the keyboard tester, as plain data so the page and the
 * specs read the same thing. Every key is identified by its KeyboardEvent.code,
 * which names the physical key and does not change with the typing language.
 */
export interface KeyDef {
  code: string;
  label: string;
  /** Width in units of one standard key. */
  w?: number;
  /** An empty spacer of this width instead of a key. */
  gap?: number;
}
export type LayoutName = 'ansi' | 'iso';

const k = (code: string, label: string, w = 1): KeyDef => ({ code, label, w });
const gap = (w: number): KeyDef => ({ code: '', label: '', gap: w });

const letters = (codes: string): KeyDef[] => [...codes].map((c) => k(`Key${c}`, c));

const fRow: KeyDef[] = [
  k('Escape', 'Esc'), gap(1),
  ...[1, 2, 3, 4].map((n) => k(`F${n}`, `F${n}`)), gap(0.5),
  ...[5, 6, 7, 8].map((n) => k(`F${n}`, `F${n}`)), gap(0.5),
  ...[9, 10, 11, 12].map((n) => k(`F${n}`, `F${n}`)),
];
const numberRow: KeyDef[] = [
  k('Backquote', '`'),
  ...'1234567890'.split('').map((d) => k(`Digit${d}`, d)),
  k('Minus', '-'), k('Equal', '='), k('Backspace', 'Backspace', 2),
];
const mod = (side: 'Left' | 'Right', name: string, label: string, w: number) => k(`${name}${side}`, label, w);

export const LAYOUTS: Record<LayoutName, KeyDef[][]> = {
  ansi: [
    fRow,
    numberRow,
    [k('Tab', 'Tab', 1.5), ...letters('QWERTYUIOP'), k('BracketLeft', '['), k('BracketRight', ']'), k('Backslash', '\\', 1.5)],
    [k('CapsLock', 'Caps Lock', 1.75), ...letters('ASDFGHJKL'), k('Semicolon', ';'), k('Quote', "'"), k('Enter', 'Enter', 2.25)],
    [mod('Left', 'Shift', 'Shift', 2.25), ...letters('ZXCVBNM'), k('Comma', ','), k('Period', '.'), k('Slash', '/'), mod('Right', 'Shift', 'Shift', 2.75)],
    [
      mod('Left', 'Control', 'Ctrl', 1.25), mod('Left', 'Meta', 'Win/Cmd', 1.25), mod('Left', 'Alt', 'Alt', 1.25),
      k('Space', 'Space', 6.25),
      mod('Right', 'Alt', 'Alt', 1.25), mod('Right', 'Meta', 'Win/Cmd', 1.25), k('ContextMenu', 'Menu', 1.25), mod('Right', 'Control', 'Ctrl', 1.25),
    ],
  ],
  iso: [
    fRow,
    numberRow,
    [k('Tab', 'Tab', 1.5), ...letters('QWERTYUIOP'), k('BracketLeft', '['), k('BracketRight', ']'), k('Enter', 'Enter', 1.5)],
    [k('CapsLock', 'Caps Lock', 1.75), ...letters('ASDFGHJKL'), k('Semicolon', ';'), k('Quote', "'"), k('Backslash', '#')],
    [mod('Left', 'Shift', 'Shift', 1.25), k('IntlBackslash', '\\'), ...letters('ZXCVBNM'), k('Comma', ','), k('Period', '.'), k('Slash', '/'), mod('Right', 'Shift', 'Shift', 2.75)],
    [
      mod('Left', 'Control', 'Ctrl', 1.25), mod('Left', 'Meta', 'Win/Cmd', 1.25), mod('Left', 'Alt', 'Alt', 1.25),
      k('Space', 'Space', 6.25),
      mod('Right', 'Alt', 'Alt Gr', 1.25), mod('Right', 'Meta', 'Win/Cmd', 1.25), k('ContextMenu', 'Menu', 1.25), mod('Right', 'Control', 'Ctrl', 1.25),
    ],
  ],
};

/** The block between the main keys and the numpad. */
export const NAV: KeyDef[][] = [
  [k('PrintScreen', 'PrtSc'), k('ScrollLock', 'ScrLk'), k('Pause', 'Pause')],
  [],
  [k('Insert', 'Ins'), k('Home', 'Home'), k('PageUp', 'PgUp')],
  [k('Delete', 'Del'), k('End', 'End'), k('PageDown', 'PgDn')],
  [],
  [gap(1), k('ArrowUp', '↑'), gap(1)],
  [k('ArrowLeft', '←'), k('ArrowDown', '↓'), k('ArrowRight', '→')],
];

export const NUMPAD: KeyDef[][] = [
  [],
  [],
  [k('NumLock', 'Num'), k('NumpadDivide', '/'), k('NumpadMultiply', '*'), k('NumpadSubtract', '-')],
  [k('Numpad7', '7'), k('Numpad8', '8'), k('Numpad9', '9'), k('NumpadAdd', '+')],
  [k('Numpad4', '4'), k('Numpad5', '5'), k('Numpad6', '6'), gap(1)],
  [k('Numpad1', '1'), k('Numpad2', '2'), k('Numpad3', '3'), k('NumpadEnter', 'Ent')],
  [k('Numpad0', '0', 2), k('NumpadDecimal', '.'), gap(1)],
];

export const allCodes = (layout: LayoutName): string[] =>
  [...LAYOUTS[layout].flat(), ...NAV.flat(), ...NUMPAD.flat()].filter((x) => x.code).map((x) => x.code);

/** Keys whose default action (scrolling, a menu, find-in-page, reload) would get in the way. */
const SWALLOW = /^(Space|F\d+|Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home|End|Backspace|Enter|ContextMenu|AltLeft|AltRight|Quote|Slash|Delete|Insert|NumLock|ScrollLock|Pause|PrintScreen)$/;

/** Whether to call preventDefault for a keydown at an ordinary part of the page. */
export function shouldSwallow(e: { code: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (e.ctrlKey || e.metaKey) return false; // Ctrl/Cmd shortcuts stay the browser's: copy, reload, close tab
  return SWALLOW.test(e.code);
}
