// Houdini's F1 pane runs on the QtWebEngine that ships with that Houdini
// build. An old one (Houdini 21: Chromium 108) cannot parse `oklch()` or
// `color-mix()` — the whole design token system in `src/styles/globals.css`
// is written in those, since Tailwind 4 itself defaults to them. An engine
// that cannot parse a color does not fall back to a close one: the
// declaration is invalid, so the property is simply unset.
//
// These two plugins from csstools (the same authors behind
// `postcss-preset-env`) rewrite every such declaration into a legacy `rgb()`
// fallback followed by the original wrapped in `@supports (color: oklab(0%
// 0 0))` — an old engine reads only the fallback line, a current one reads
// past it into the `@supports` block and gets the real color. See
// agents/houdini-pane.md.
import oklabFunction from "@csstools/postcss-oklab-function";
import colorMixFunction from "@csstools/postcss-color-mix-function";

export default {
  plugins: [oklabFunction({ preserve: true }), colorMixFunction({ preserve: true })],
};
