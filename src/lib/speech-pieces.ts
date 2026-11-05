import { nextCut } from './captions';

/** One stretch of a recording for the speech model: where it starts (in samples from the start of the recording) and its samples. */
export interface Piece {
  from: number;
  samples: Float32Array;
}

/**
 * Cuts a recording that arrives in chunks of any size into pieces of up to 28 seconds, at the same pauses `cutPoints` would
 * find in the whole recording, holding no more than one piece and the chunk being added. `skip` drops that many samples from
 * the front (a read picked up again after the first pieces were done) and numbers the pieces from there.
 */
export async function* piecesOf(chunks: AsyncIterable<Float32Array>, rate: number, skip = 0, max = 28): AsyncGenerator<Piece> {
  let buf = new Float32Array(Math.ceil((max + 2) * rate));
  let len = 0;
  let at = 0;
  let toSkip = skip;
  for await (let chunk of chunks) {
    if (toSkip > 0) {
      const drop = Math.min(toSkip, chunk.length);
      chunk = chunk.subarray(drop);
      toSkip -= drop;
      at += drop;
    }
    if (len + chunk.length > buf.length) {
      const bigger = new Float32Array(Math.max(len + chunk.length, Math.ceil(buf.length * 1.5)));
      bigger.set(buf.subarray(0, len));
      buf = bigger;
    }
    buf.set(chunk, len);
    len += chunk.length;
    while (len > max * rate) {
      const cut = nextCut(buf.subarray(0, len), 0, rate, max);
      const samples = buf.slice(0, cut);
      buf.copyWithin(0, cut, len);
      len -= cut;
      const from = at;
      at += cut;
      yield { from, samples };
    }
  }
  if (len > 0) yield { from: at, samples: buf.slice(0, len) };
}
