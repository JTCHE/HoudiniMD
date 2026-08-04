import { expect, test } from "bun:test";
import { parseWebmDimensions } from "./dimensions";

// Hand-built minimal EBML: Segment > Tracks > TrackEntry > Video > PixelWidth(1362), PixelHeight(764).
const MINIMAL_WEBM = new Uint8Array([
  0x18, 0x53, 0x80, 0x67, 0x91, // Segment, size 17
  0x16, 0x54, 0xae, 0x6b, 0x8c, // Tracks, size 12
  0xae, 0x8a, // TrackEntry, size 10
  0xe0, 0x88, // Video, size 8
  0xb0, 0x82, 0x05, 0x52, // PixelWidth, size 2, value 1362
  0xba, 0x82, 0x02, 0xfc, // PixelHeight, size 2, value 764
]);

test("reads width/height from a minimal WebM header", () => {
  expect(parseWebmDimensions(MINIMAL_WEBM)).toEqual({ width: 1362, height: 764 });
});

test("returns null when the prefix is truncated before Video", () => {
  expect(parseWebmDimensions(MINIMAL_WEBM.slice(0, 12))).toBeNull();
});

test("returns null for non-EBML bytes", () => {
  expect(parseWebmDimensions(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBeNull();
});

test("skips an audio-only TrackEntry with no Video sub-element", () => {
  const audioOnly = new Uint8Array([
    0x18, 0x53, 0x80, 0x67, 0x85, // Segment, size 5
    0x16, 0x54, 0xae, 0x6b, 0x83, // Tracks, size 3
    0xae, 0x81, 0x00, // TrackEntry, size 1, arbitrary byte
  ]);
  expect(parseWebmDimensions(audioOnly)).toBeNull();
});
