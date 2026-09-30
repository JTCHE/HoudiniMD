/**
 * ONE LINE WEIGHT FOR EVERY ICON IN THE CHROME.
 *
 * The stylesheet draws each icon line at `--icon-stroke`, whatever size the
 * icon has. This keeps that value on whole device pixels: one CSS pixel is
 * 1.25 device pixels on a 125% screen, and the browser smears that line over
 * two pixels. So the line is one CSS pixel rounded to whole device pixels, and
 * at least one. At 150% that is two device pixels: one reads too faint.
 *
 * The ratio changes when the window moves to another screen or the zoom
 * changes, so the value is set again then.
 */
export function startIconStroke() {
  const ratio = window.devicePixelRatio || 1;
  document.documentElement.style.setProperty("--icon-stroke", `${Math.max(1, Math.round(ratio)) / ratio}px`);
  window.matchMedia(`(resolution: ${ratio}dppx)`).addEventListener("change", startIconStroke, { once: true });
}
