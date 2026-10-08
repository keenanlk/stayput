/**
 * Experiment E2: after a job finishes, suggest two related tools. Half of
 * visits (chosen at random per tab, see journey.ts) see the box; the other
 * half are the comparison group. Clicks are counted with the tool pair and
 * the arm, nothing else.
 */
import { track } from './analytics';
import { journey } from './journey';
import { saveHandoff } from './handoff';
import type { OutputFile } from './files';

export function mountNextSteps(root: HTMLElement): void {
  const box = document.getElementById('next-steps');
  if (!box) return;
  const tool = root.dataset.slug ?? 'unknown';
  let outputs: OutputFile[] = [];
  root.addEventListener('stayput:done', (e) => {
    outputs = (e as CustomEvent<OutputFile[] | undefined>).detail ?? [];
    if (journey().ns === 'on') box.hidden = false;
  });
  box.addEventListener('click', async (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-to]');
    if (!link) return;
    track('next_step', { tool, to: link.dataset.to ?? 'unknown', ns: journey().ns });
    // Links marked data-handoff carry a run's single output to the next tool (see handoff.ts), saved on this device only.
    // Anything else, a modified click, or a failed save follows the plain link and the next tool asks for a file.
    const plain = e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented;
    const out = outputs.length === 1 ? outputs[0] : undefined;
    if (plain || !out || link.dataset.handoff === undefined) return;
    e.preventDefault();
    link.setAttribute('aria-busy', 'true');
    await saveHandoff(out, link.pathname, root.dataset.name ?? 'the last tool');
    location.assign(link.href);
  });
}
