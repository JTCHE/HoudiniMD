/**
 * The ground a picture needs behind it.
 *
 * Many help pictures are line art on a clear ground, drawn for SideFX's white
 * page. On the dark theme the lines vanish, and a mid grey only half helps:
 * thin, soft lines on it still read as an empty box. So each picture is read
 * once, small, when it loads: dark marks get white behind them, light marks
 * get black, and a picture with no clear part needs nothing.
 */
export type Ground = "white" | "black" | "none";

const SAMPLE = 48;

export function groundFor(image: HTMLImageElement): Ground | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
    const pixels = context.getImageData(0, 0, SAMPLE, SAMPLE).data;
    let clear = 0;
    let weight = 0;
    let light = 0;
    for (let at = 0; at < pixels.length; at += 4) {
      const alpha = pixels[at + 3] / 255;
      if (alpha < 0.98) clear += 1;
      if (alpha < 0.1) continue;
      const luminance = (0.2126 * pixels[at] + 0.7152 * pixels[at + 1] + 0.0722 * pixels[at + 2]) / 255;
      light += luminance * alpha;
      weight += alpha;
    }
    if (clear < (SAMPLE * SAMPLE) / 20 || weight === 0) return "none";
    return light / weight < 0.5 ? "white" : "black";
  } catch {
    // A picture the canvas may not read. The caller keeps its default.
    return null;
  }
}

/** The class for a ground. Before a picture is read, a mid grey keeps both
    dark and light marks legible. */
export function groundClass(ground: Ground | null | undefined): string {
  return ground === "white" ? "bg-white" : ground === "black" ? "bg-black" : ground === "none" ? "" : "bg-neutral-500";
}
