/**
 * PWA install prompt, shown once, after the second successful tool run, never
 * on a first visit. Chrome and Edge fire beforeinstallprompt; other browsers
 * get nothing, which is fine. Dismissal is remembered in localStorage.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY_RUNS = 'stayput:runs';
const KEY_DISMISSED = 'stayput:install-dismissed';

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage disabled: the prompt is simply not remembered.
  }
}

export function mountInstallPrompt(root: HTMLElement): void {
  const banner = document.getElementById('install');
  const yes = document.getElementById('install-yes');
  const no = document.getElementById('install-no');
  if (!banner || !yes || !no) return;
  let deferred: BeforeInstallPromptEvent | null = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });

  root.addEventListener('stayput:done', () => {
    const runs = Number(get(KEY_RUNS) ?? 0) + 1;
    set(KEY_RUNS, String(runs));
    if (runs >= 2 && deferred && !get(KEY_DISMISSED) && !matchMedia('(display-mode: standalone)').matches) {
      banner.hidden = false;
    }
  });

  yes.addEventListener('click', async () => {
    banner.hidden = true;
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === 'accepted') {
      set(KEY_DISMISSED, '1');
      try {
        window.umami?.track('pwa_install');
      } catch {
        // never affects the tool
      }
    }
  });
  no.addEventListener('click', () => {
    banner.hidden = true;
    set(KEY_DISMISSED, '1');
  });
}
