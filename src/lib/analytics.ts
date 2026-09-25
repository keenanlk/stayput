/**
 * Privacy-preserving usage events. Umami (self-hosted, cookie-free) is loaded
 * by the page layout; this module only calls it if it is present. Events carry
 * the tool slug, an outcome, and coarse buckets. Never file names, sizes,
 * types or contents.
 */
declare global {
  interface Window {
    umami?: { track: (name: string, data?: Record<string, string | number>) => void };
  }
}

export function sizeBucket(bytes: number): string {
  if (bytes < 1_000_000) return '<1MB';
  if (bytes < 10_000_000) return '1-10MB';
  if (bytes < 50_000_000) return '10-50MB';
  if (bytes < 200_000_000) return '50-200MB';
  return '200MB+';
}

export function countBucket(n: number): string {
  if (n <= 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 20) return '6-20';
  if (n <= 100) return '21-100';
  return '100+';
}

export function durationBucket(ms: number): string {
  if (ms < 1000) return '<1s';
  if (ms < 5000) return '1-5s';
  if (ms < 30_000) return '5-30s';
  return '30s+';
}

export function trackToolRun(data: { tool: string; outcome: 'ok' | 'error'; files: number; inputBytes: number; outputBytes?: number; ms: number }): void {
  try {
    window.umami?.track('tool_run', {
      tool: data.tool,
      outcome: data.outcome,
      files: countBucket(data.files),
      input: sizeBucket(data.inputBytes),
      ...(data.outputBytes !== undefined ? { output: sizeBucket(data.outputBytes) } : {}),
      duration: durationBucket(data.ms),
    });
  } catch {
    // Analytics must never affect the tool.
  }
}
