/**
 * Header search: a dialog that filters /search-index.json as you type. The
 * index is fetched once, the first time the search opens (the service worker
 * precaches it for offline use), and matching runs here in the page. The only
 * analytics are search_open and search_pick with the destination path; the
 * query itself is never stored or sent.
 */
import type { SearchEntry } from '../data/search-index';
import { search } from './search';
import { track } from './analytics';
import { markVia } from './journey';

let indexPromise: Promise<SearchEntry[]> | undefined;
function loadIndex(): Promise<SearchEntry[]> {
  indexPromise ??= fetch('/search-index.json').then((r) => {
    if (!r.ok) throw new Error(`search index: HTTP ${r.status}`);
    return r.json() as Promise<SearchEntry[]>;
  });
  indexPromise.catch(() => (indexPromise = undefined));
  return indexPromise;
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export function initSearch(): void {
  const trigger = document.querySelector<HTMLButtonElement>('.search-trigger');
  const dialog = document.querySelector<HTMLDialogElement>('.search-dialog');
  const input = dialog?.querySelector<HTMLInputElement>('input');
  const list = dialog?.querySelector<HTMLUListElement>('.search-results');
  const empty = dialog?.querySelector<HTMLElement>('.search-empty');
  const close = dialog?.querySelector<HTMLButtonElement>('.search-close');
  if (!trigger || !dialog || !input || !list || !empty || !close || typeof dialog.showModal !== 'function') return;
  trigger.hidden = false;

  let results: SearchEntry[] = [];
  let active = 0;
  let opened = false;

  const setActive = (i: number, scroll = true) => {
    const items = list.children;
    if (!items.length) return input.removeAttribute('aria-activedescendant');
    active = (i + items.length) % items.length;
    for (let n = 0; n < items.length; n++) items[n]!.setAttribute('aria-selected', String(n === active));
    const el = items[active] as HTMLElement;
    input.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  };

  const render = async () => {
    let index: SearchEntry[];
    try {
      index = await loadIndex();
    } catch {
      list.replaceChildren();
      empty.hidden = false;
      empty.textContent = 'Search could not load. Check your connection and try again.';
      return;
    }
    results = search(index, input.value);
    const items = results.map((e, i) => {
      const li = document.createElement('li');
      li.id = `search-opt-${i}`;
      li.setAttribute('role', 'option');
      li.dataset.kind = e.k;
      const a = document.createElement('a');
      a.href = e.p;
      a.tabIndex = -1;
      const name = document.createElement('span');
      name.className = 'sr-name';
      name.textContent = e.n;
      const kind = document.createElement('span');
      kind.className = 'sr-kind';
      kind.textContent = e.c;
      const desc = document.createElement('span');
      desc.className = 'sr-desc';
      desc.textContent = e.d;
      a.append(name, kind, desc);
      a.addEventListener('click', () => pick(i));
      li.addEventListener('pointermove', () => active !== i && setActive(i, false));
      li.append(a);
      return li;
    });
    list.replaceChildren(...items);
    empty.hidden = results.length > 0;
    list.hidden = results.length === 0;
    setActive(0);
  };

  const pick = (i: number) => {
    const e = results[i];
    if (!e) return;
    try {
      markVia('search');
      track('search_pick', { to: e.p, kind: e.k, rank: i < 3 ? String(i + 1) : i < 10 ? '4-10' : '11+' });
    } catch {
      // Analytics must never affect navigation.
    }
  };

  const open = () => {
    if (dialog.open) return;
    dialog.showModal();
    input.select();
    void render();
    if (!opened) {
      opened = true;
      track('search_open', { page: location.pathname.replace(/\.html$/, '') || '/' });
    }
  };

  trigger.addEventListener('click', open);
  close.addEventListener('click', () => dialog.close());
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', (ev) => ev.target === dialog && dialog.close());
  input.addEventListener('input', () => void render());
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive(active + (ev.key === 'ArrowDown' ? 1 : -1));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const e = results[active];
      if (!e) return;
      pick(active);
      location.href = e.p;
    }
  });
  // Warm the index as soon as the pointer or focus reaches the button.
  const warm = () => void loadIndex().catch(() => {});
  trigger.addEventListener('pointerenter', warm, { once: true });
  trigger.addEventListener('focus', warm, { once: true });

  document.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || dialog.open) return;
    const k = ev.key.toLowerCase();
    if ((k === 'k' && (ev.metaKey || ev.ctrlKey) && !ev.altKey && !ev.shiftKey) || (ev.key === '/' && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !isTyping(document.activeElement))) {
      ev.preventDefault();
      open();
    }
  });
}
