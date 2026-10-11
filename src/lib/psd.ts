/**
 * Photoshop (PSD) decoding. Only the flattened image Photoshop saves beside
 * the layers is read ("Maximize Compatibility"); layers are never rendered.
 * ag-psd is bundled with the site and loaded only when a PSD arrives, so
 * nothing is fetched from anywhere else.
 */
import { extOf, readHead } from './files';

/** True when the file is a Photoshop document by signature ("8BPS"), or by name when the bytes are unreadable. */
export async function isPsdFile(file: Blob & { name?: string }): Promise<boolean> {
  const b = await readHead(file, 6);
  if (b.length >= 4) return b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53;
  return (file.name ? extOf(file.name) : '') === 'psd';
}

/** Decode the saved composite image of a PSD to a bitmap, with its transparency. */
export async function decodePsd(file: Blob): Promise<ImageBitmap> {
  const head = await readHead(file, 6);
  const version = head.length >= 6 ? (head[4]! << 8) | head[5]! : 1;
  if (version === 2) throw new Error('This is a large-document PSB file, which is not supported. Save it as a regular PSD, or flatten it to a smaller size first.');
  const { readPsd } = await import('ag-psd');
  let psd;
  try {
    psd = readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: true, skipLinkedFilesData: true, useImageData: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/CMYK|Color mode not supported/i.test(msg)) throw new Error('This PSD is in CMYK, Lab or another colour mode this page cannot read. In Photoshop, choose Image → Mode → RGB Color and save it again.');
    throw new Error('This PSD could not be read. It may be damaged, or saved without the flattened image: in Photoshop, turn on Preferences → File Handling → Maximize PSD and PSB File Compatibility: Always, then save it again.');
  }
  const img = psd.imageData;
  const { width, height } = psd;
  if (!img || !width || !height) {
    throw new Error('This PSD has no flattened image saved in it. In Photoshop, turn on Preferences → File Handling → Maximize PSD and PSB File Compatibility: Always, then save it again.');
  }
  const px = width * height * 4;
  if (img.data.length < px) throw new Error('This PSD uses an encoding the decoder cannot read.');
  let rgba: Uint8ClampedArray<ArrayBuffer>;
  if (img.data instanceof Uint8ClampedArray || img.data instanceof Uint8Array) {
    rgba = new Uint8ClampedArray(img.data.buffer as ArrayBuffer, img.data.byteOffset, px);
  } else {
    // 16 and 32-bit documents come back as wider integers or floats; a screen shows 8 bits per channel.
    rgba = new Uint8ClampedArray(px);
    const src = img.data as ArrayLike<number>;
    const float = src instanceof Float32Array;
    const shift = src instanceof Uint16Array ? 257 : 1;
    for (let i = 0; i < px; i++) rgba[i] = float ? src[i]! * 255 : src[i]! / shift;
  }
  return createImageBitmap(new ImageData(rgba, width, height));
}
