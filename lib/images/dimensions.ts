/**
 * Pixel dimensions read from an image file's header only — no full decode.
 * Supports the formats SideFX serves: JPEG, PNG, GIF, WebP.
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function isAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function parsePng(bytes: Uint8Array): ImageDimensions | null {
  // Signature (8 bytes) + IHDR chunk header (length+type, 8 bytes) always
  // precedes the width/height fields — fixed offsets, no scanning needed.
  if (bytes.length < 24) return null;
  const width = readUInt32BE(bytes, 16);
  const height = readUInt32BE(bytes, 20);
  return width && height ? { width, height } : null;
}

function parseGif(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;
  const width = readUInt16LE(bytes, 6);
  const height = readUInt16LE(bytes, 8);
  return width && height ? { width, height } : null;
}

function parseJpeg(bytes: Uint8Array): ImageDimensions | null {
  // Walk the marker segments looking for a Start-Of-Frame marker (0xC0-0xCF,
  // excluding the DHT/JPG/DAC markers 0xC4/0xC8/0xCC which share the range).
  // SOF carries the real pixel size; earlier markers (APPn/EXIF/ICC) don't.
  let offset = 2; // skip SOI (0xFFD8)
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // Markers with no payload segment.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) return null; // Start-of-scan reached before SOF: give up.
    const segmentLength = readUInt16BE(bytes, offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > bytes.length) return null; // SOF header not fully fetched yet.
      const height = readUInt16BE(bytes, offset + 5);
      const width = readUInt16BE(bytes, offset + 7);
      return width && height ? { width, height } : null;
    }
    offset += 2 + segmentLength;
  }
  return null; // SOF marker not within the fetched prefix.
}

function parseWebp(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30 || !isAscii(bytes, 0, "RIFF") || !isAscii(bytes, 8, "WEBP")) return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === "VP8 ") {
    // Lossy: 3-byte frame tag + sync code, then 14-bit width/height (top 2 bits are scale).
    const width = readUInt16LE(bytes, 26) & 0x3fff;
    const height = readUInt16LE(bytes, 28) & 0x3fff;
    return width && height ? { width, height } : null;
  }
  if (chunk === "VP8L") {
    // Lossless: 1-byte signature (0x2f) then 14 bits width-1, 14 bits height-1.
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width && height ? { width, height } : null;
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit (width-1) then 24-bit (height-1), little-endian, at offset 24/27.
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    return width && height ? { width, height } : null;
  }
  return null;
}

/** Parse width/height from an image's leading bytes. Returns null if the format is unrecognized or the header is incomplete (caller should fetch more bytes or give up). */
export function parseImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && isAscii(bytes, 1, "PNG")) return parsePng(bytes);
  if (bytes.length >= 6 && isAscii(bytes, 0, "GIF87a")) return parseGif(bytes);
  if (bytes.length >= 6 && isAscii(bytes, 0, "GIF89a")) return parseGif(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
  if (bytes.length >= 12 && isAscii(bytes, 0, "RIFF") && isAscii(bytes, 8, "WEBP")) return parseWebp(bytes);
  return null;
}
