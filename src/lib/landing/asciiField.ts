/* Defaults for the server-rendered first paint, before the client measures
   its actual box and rebuilds to fit. Sized generously so the pre-hydration
   frame covers most screens without a visible gap. */
export const ASCII_COLUMN_COUNT = 220;
export const ASCII_ROW_COUNT = 70;

/* A monospace cell is about 0.6em wide and (at leading-relaxed) 1.625em tall,
   so one row step covers 2.7 column steps on screen. The wave reads through
   this ratio, which keeps the crests round instead of stretched into
   horizontal bands. */
const ROW_TO_COLUMN_RATIO = 2.7;

/**
 * Pattern controls. Lower frequencies = bigger, calmer crests (fewer, wider
 * waves); higher frequencies = busier, noisier ones. `driftSpeed` scales how
 * fast each term moves relative to the others as `phase` advances — keep the
 * terms close together (as below) for a coherent single wave, or spread them
 * apart for more chaotic interference.
 */
const WAVE_TERMS = [
  { frequencyX: 0.045, frequencyY: 0.03, amplitude: 1, phaseOffset: 0, driftSpeed: 1 },
  { frequencyX: 0.07, frequencyY: -0.05, amplitude: 0.6, phaseOffset: 1.7, driftSpeed: -0.7 },
  { frequencyX: 0.11, frequencyY: 0.08, amplitude: 0.35, phaseOffset: 3.1, driftSpeed: 0.5 },
];

const WAVE_AMPLITUDE_TOTAL = WAVE_TERMS.reduce((sum, term) => sum + term.amplitude, 0);

/* Sparsest to densest, high threshold first. Raise these (or drop a level)
   for a sparser field; lower them for a denser one. Six tiers, close
   together, so the wave reads as a gradient instead of a handful of hard
   contour lines. */
const GLYPH_LEVELS: Array<{ threshold: number; glyph: string }> = [
  { threshold: 0.82, glyph: "@" },
  { threshold: 0.74, glyph: "○" },
  { threshold: 0.66, glyph: "×" },
  { threshold: 0.58, glyph: "+" },
  { threshold: 0.5, glyph: ":" },
  { threshold: 0.42, glyph: "·" },
];

/* Ordered (Bayer) dithering. Adding this small, fixed per-cell offset before
   quantizing to a glyph turns each hard tier boundary into a fine, textured
   scatter instead of a stair-stepped block edge — the same trick halftone
   printing and 1-bit image dithering use. Purely a function of cell
   position, so it costs nothing to keep it a pure function of column/row. */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const DITHER_STRENGTH = 0.09;

function ditherOffset(column: number, row: number): number {
  const bayerValue = BAYER_4X4[row % 4][column % 4];
  return (bayerValue / 16 - 0.5) * DITHER_STRENGTH;
}

/**
 * The wave terms interfere; their crests carry the dense glyphs and the
 * troughs stay blank, which gives the sparse wave the mockup has. `phase`
 * drifts the crests over time — the field is still a pure function of its
 * inputs, so a given (column, row, phase) always renders the same glyph on
 * server and client.
 */
function densityAt(column: number, row: number, phase: number): number {
  const waveX = column;
  const waveY = row * ROW_TO_COLUMN_RATIO;
  let wave = 0;
  for (const term of WAVE_TERMS) {
    wave +=
      term.amplitude *
      Math.sin(term.frequencyX * waveX + term.frequencyY * waveY + term.phaseOffset + phase * term.driftSpeed);
  }
  return wave / (2 * WAVE_AMPLITUDE_TOTAL) + 0.5 + ditherOffset(column, row);
}

function glyphFor(density: number): string {
  for (const level of GLYPH_LEVELS) {
    if (density > level.threshold) return level.glyph;
  }
  return " ";
}

export function buildAsciiField(phase = 0, columnCount = ASCII_COLUMN_COUNT, rowCount = ASCII_ROW_COUNT): string {
  const lines: string[] = [];
  for (let row = 0; row < rowCount; row++) {
    let line = "";
    for (let column = 0; column < columnCount; column++) {
      line += glyphFor(densityAt(column, row, phase));
    }
    lines.push(line);
  }
  return lines.join("\n");
}
