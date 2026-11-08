/**
 * The text of a subtitle file from its bytes. Subtitle files come in whatever the editor that saved them used: UTF-8 (with or
 * without a byte-order mark), UTF-16 from Windows tools, or an old 8-bit code page (Windows-1252) from older ones. The bytes
 * are read as the encoding they declare or show; a file that is not valid UTF-8 is taken as Windows-1252.
 */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  // UTF-16 without a mark: mostly ASCII text, so every other byte is zero.
  const sample = Math.min(bytes.length, 400);
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < sample; i++) if (bytes[i] === 0) {
      if (i % 2) oddZero++;
      else evenZero++;
    }
  if (sample >= 4 && oddZero > sample * 0.3 && evenZero === 0) return new TextDecoder('utf-16le').decode(bytes);
  if (sample >= 4 && evenZero > sample * 0.3 && oddZero === 0) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
