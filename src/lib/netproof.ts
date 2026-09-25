/**
 * The "open the network tab" hook, made visible on the page itself.
 *
 * Uses the Resource Timing API to list every request this tab has made since
 * the user added files. It is an honest list: the HEIC decoder program and the
 * anonymous usage counter show up too, each labelled with what it carries.
 * What never appears is a request carrying a file, because there is none.
 */
const LABELS: [RegExp, string][] = [
  [/^cdn\.jsdelivr\.net$/, 'decoder program (code only, cached)'],
  [/^stats\.keenankaufman\.com$/, 'anonymous usage count: tool name and size bucket, no file data'],
];

function label(host: string): string {
  if (host === location.hostname) return 'this site’s own code';
  for (const [re, text] of LABELS) if (re.test(host)) return text;
  return 'unexpected: please report this';
}

function entriesSince(mark: number): PerformanceResourceTiming[] {
  return (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(
    (e) => e.startTime >= mark && !/^(blob|data):/.test(e.name),
  );
}

export function mountNetProof(root: HTMLElement): void {
  const panel = document.getElementById('netproof');
  const listEl = document.getElementById('netproof-list');
  const summaryEl = document.getElementById('netproof-summary');
  if (!panel || !listEl || !summaryEl) return;
  const list: HTMLElement = listEl;
  const summary: HTMLElement = summaryEl;
  let mark = -1;

  root.addEventListener('stayput:files', () => {
    if (mark < 0) mark = performance.now();
    panel.hidden = false;
    renderPending();
  });
  root.addEventListener('stayput:done', () => {
    // Give the usage-count request a moment to be recorded, then report.
    setTimeout(render, 600);
  });

  function renderPending() {
    summary.textContent = 'Watching this tab’s network activity. Run the tool and the list below shows every request made since you added files.';
    list.innerHTML = '';
  }

  function render() {
    const entries = entriesSince(mark);
    const byHost = new Map<string, { count: number; bytes: number }>();
    for (const e of entries) {
      let host = '';
      try {
        host = new URL(e.name).hostname;
      } catch {
        continue;
      }
      const cur = byHost.get(host) ?? { count: 0, bytes: 0 };
      cur.count += 1;
      cur.bytes += e.transferSize || 0;
      byHost.set(host, cur);
    }
    list.innerHTML = '';
    const total = entries.length;
    const inputBytes = Number(root.dataset.inputBytes ?? 0);
    summary.textContent =
      total === 0
        ? `Since you added files, this tab made 0 network requests. Your ${fmt(inputBytes)} of files stayed here.`
        : `Since you added files, this tab made ${total} request${total === 1 ? '' : 's'}, none carrying your files. Your ${fmt(inputBytes)} stayed here.`;
    for (const [host, { count, bytes }] of byHost) {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = host;
      li.append(code, ` · ${count} request${count === 1 ? '' : 's'}${bytes ? `, ${fmt(bytes)}` : ''} · ${label(host)}`);
      list.append(li);
    }
    const note = document.createElement('li');
    note.className = 'muted';
    note.textContent = 'Compare with your browser’s own network panel (F12 or Cmd-Option-I, then Network). The two lists should agree.';
    list.append(note);
  }
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
