/** An M4R is the M4A bytes with Apple's own `M4A ` major brand in place of Mediabunny's `isom`. */
export function patchBrand(bytes: Uint8Array): Uint8Array {
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 12 || tag(4) !== 'ftyp') throw new Error('Not an MP4 file.');
  const out = bytes.slice();
  out.set([0x4d, 0x34, 0x41, 0x20], 8);
  return out;
}
