/**
 * AIFF fixtures are built here, not committed: 1.5 s of a 440 Hz tone (left)
 * and 660 Hz (right), as plain AIFF or as AIFC ('NONE' big-endian, 'sowt'
 * little-endian), at 16 or 24 bits.
 */
export function extended(rate: number): number[] {
  const exp = Math.floor(Math.log2(rate));
  const mant = BigInt(Math.round((rate / 2 ** exp) * 2 ** 63));
  const out = [(16383 + exp) >> 8, (16383 + exp) & 0xff];
  for (let i = 7; i >= 0; i--) out.push(Number((mant >> BigInt(i * 8)) & 0xffn));
  return out;
}

export function aiff(opts: { channels: number; bits: 8 | 16 | 24 | 32; rate: number; seconds: number; aifc?: 'NONE' | 'sowt' | 'twos' | 'fl32' | 'ulaw'; offset?: number; oddChunk?: boolean }): Buffer {
  const { channels, bits, rate, seconds, aifc, offset = 0, oddChunk } = opts;
  const frames = Math.round(rate * seconds);
  const bytes = bits / 8;
  const little = aifc === 'sowt';
  const data = Buffer.alloc(frames * channels * bytes);
  const max = 2 ** (bits - 1) - 1;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const x = Math.sin((2 * Math.PI * (440 + c * 220) * i) / rate) * 0.5;
      const at = (i * channels + c) * bytes;
      if (aifc === 'fl32') {
        data.writeFloatBE(x, at);
        continue;
      }
      const v = Math.round(x * max);
      for (let b = 0; b < bytes; b++) {
        const shift = little ? b * 8 : (bytes - 1 - b) * 8;
        data[at + b] = Math.floor(v / 2 ** shift) & 0xff;
      }
    }
  }
  const comm = Buffer.alloc(aifc ? 18 + 4 + 2 : 18);
  comm.writeUInt16BE(channels, 0);
  comm.writeUInt32BE(frames, 2);
  comm.writeUInt16BE(bits, 6);
  Buffer.from(extended(rate)).copy(comm, 8);
  if (aifc) {
    comm.write(aifc === 'ulaw' ? 'ulaw' : aifc, 18, 'latin1');
    comm.writeUInt8(0, 22); // empty pascal string, padded to even length
  }
  const chunk = (id: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'latin1');
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const ssndHead = Buffer.alloc(8);
  ssndHead.writeUInt32BE(offset, 0);
  const ssnd = Buffer.concat([ssndHead, Buffer.alloc(offset, 0x55), data]);
  const parts = [Buffer.from(aifc ? 'AIFC' : 'AIFF', 'latin1')];
  if (aifc) {
    const fver = Buffer.alloc(4);
    fver.writeUInt32BE(0xa2805140, 0);
    parts.push(chunk('FVER', fver));
  }
  if (oddChunk) parts.push(chunk('ANNO', Buffer.from('odd')));
  parts.push(chunk('COMM', comm), chunk('SSND', ssnd));
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('FORM', 0, 'latin1');
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}

