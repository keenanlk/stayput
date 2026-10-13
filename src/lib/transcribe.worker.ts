import * as transformers from '@huggingface/transformers';
import { createRecogniser, type Request } from './transcribe-core';

export type { Reply, Request } from './transcribe-core';

/** The 8-bit path: the model and the engine are what this site has always served, on WebAssembly. */
const recognise = createRecogniser(transformers);

self.onmessage = async (e: MessageEvent<Request>) => {
  (self as unknown as Worker).postMessage(await recognise(e.data, false));
};
