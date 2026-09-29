/** Traces images off the main thread, so the page keeps responding. It gets pixels, never the file. */
import { traceToSvg, type Pixels, type TraceOptions, type TraceResult } from './trace';

export type TraceRequest = { id: number; image: Pixels; options: TraceOptions };
export type TraceReply = { id: number; result?: TraceResult; error?: string };

self.onmessage = (e: MessageEvent<TraceRequest>) => {
  const { id, image, options } = e.data;
  try {
    const result = traceToSvg(image, options);
    (self as unknown as Worker).postMessage({ id, result } satisfies TraceReply);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies TraceReply);
  }
};
