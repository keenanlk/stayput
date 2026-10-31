/**
 * The URL to load a worker or script from on its `attempt`-th try. Chromium remembers a module or worker script
 * that failed to load by its URL and fails the same way again without asking the network, so every try after the
 * first asks for a URL it has not seen.
 */
export const retryUrl = (url: string, attempt: number): string => (attempt <= 0 ? url : `${url}${url.includes('?') ? '&' : '?'}again=${attempt}`);
