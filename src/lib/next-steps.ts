/**
 * Experiment E2: after a job finishes, suggest two related tools. Half of
 * visits (chosen at random per tab, see journey.ts) see the box; the other
 * half are the comparison group. Clicks are counted with the tool pair and
 * the arm, nothing else.
 */
import { track } from './analytics';
import { journey } from './journey';

export function mountNextSteps(root: HTMLElement): void {
  const box = document.getElementById('next-steps');
  if (!box) return;
  const tool = root.dataset.slug ?? 'unknown';
  root.addEventListener('stayput:done', () => {
    if (journey().ns === 'on') box.hidden = false;
  });
  box.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-to]');
    if (link) track('next_step', { tool, to: link.dataset.to ?? 'unknown', ns: journey().ns });
  });
}
