/**
 * Display dimensions read from a WebM (Matroska/EBML) file's leading bytes
 * only — no full decode. SideFX serves docs videos as WebM exclusively.
 */
export interface VideoDimensions {
  width: number;
  height: number;
}

// Element IDs that matter for this walk. IDs keep their length-marker bits
// (unlike sizes), so these constants are the raw bytes as they appear on disk.
const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const VIDEO = 0xe0;
const PIXEL_WIDTH = 0xb0;
const PIXEL_HEIGHT = 0xba;
const DISPLAY_WIDTH = 0x54b0;
const DISPLAY_HEIGHT = 0x54ba;

const CONTAINERS = new Set([SEGMENT, TRACKS, TRACK_ENTRY, VIDEO]);

/** Length of an EBML vint from its first byte: position of the leading 1 bit. */
function vintLength(firstByte: number): number {
  for (let i = 0; i < 8; i++) {
    if (firstByte & (0x80 >> i)) return i + 1;
  }
  return 0;
}

function readId(bytes: Uint8Array, offset: number): { id: number; length: number } | null {
  const length = vintLength(bytes[offset]);
  if (!length || offset + length > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + bytes[offset + i];
  return { id, length };
}

/** Size vint, marker bits stripped. Returns size -1 for the "unknown size" sentinel (all data bits set). */
function readSize(bytes: Uint8Array, offset: number): { size: number; length: number } | null {
  const length = vintLength(bytes[offset]);
  if (!length || offset + length > bytes.length) return null;
  const firstByteMask = 0xff >> length;
  let allOnes = (bytes[offset] & firstByteMask) === firstByteMask;
  let size = bytes[offset] & firstByteMask;
  for (let i = 1; i < length; i++) {
    size = size * 256 + bytes[offset + i];
    if (bytes[offset + i] !== 0xff) allOnes = false;
  }
  return { size: allOnes ? -1 : size, length };
}

function readUint(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[offset + i];
  return value;
}

/**
 * Walk the container's leading bytes for the first video track's display
 * dimensions, with its encoded pixel size as the fallback. The Tracks element
 * precedes the actual frame data, so a header-sized prefix is normally enough.
 * Returns null if the fetched prefix
 * didn't reach far enough, or the file isn't recognized as WebM — callers
 * must treat that as "no hint available", not a parse error.
 */
export function parseWebmDimensions(bytes: Uint8Array): VideoDimensions | null {
  let pixelWidth: number | null = null;
  let pixelHeight: number | null = null;
  let displayWidth: number | null = null;
  let displayHeight: number | null = null;

  function walk(start: number, end: number): void {
    let offset = start;
    while (offset < end) {
      const idResult = readId(bytes, offset);
      if (!idResult) return;
      const sizeResult = readSize(bytes, offset + idResult.length);
      if (!sizeResult) return;
      const dataStart = offset + idResult.length + sizeResult.length;
      const dataEnd = sizeResult.size === -1 ? end : dataStart + sizeResult.size;

      if (
        idResult.id === PIXEL_WIDTH ||
        idResult.id === PIXEL_HEIGHT ||
        idResult.id === DISPLAY_WIDTH ||
        idResult.id === DISPLAY_HEIGHT
      ) {
        if (dataEnd > bytes.length) return; // element body not fully fetched
        const value = readUint(bytes, dataStart, sizeResult.size);
        if (idResult.id === PIXEL_WIDTH) pixelWidth = value;
        else if (idResult.id === PIXEL_HEIGHT) pixelHeight = value;
        else if (idResult.id === DISPLAY_WIDTH) displayWidth = value;
        else displayHeight = value;
      } else if (CONTAINERS.has(idResult.id)) {
        if (dataStart > bytes.length) return;
        walk(dataStart, Math.min(dataEnd, bytes.length));
      }

      if (displayWidth !== null && displayHeight !== null) return;
      if (dataEnd > bytes.length) return; // this element's body wasn't fully fetched
      offset = dataEnd;
    }
  }

  walk(0, bytes.length);
  const width = displayWidth ?? pixelWidth;
  const height = displayHeight ?? pixelHeight;
  return width && height ? { width, height } : null;
}
