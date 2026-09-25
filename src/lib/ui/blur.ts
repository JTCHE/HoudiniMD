/**
 * Whether the window may blur what is behind a modal.
 *
 * On a GPU a still `backdrop-filter` costs nothing per keystroke. Drawn in
 * software — a machine with no usable GPU, a blocked driver, a remote desktop
 * — it is blurred again on every change above it, and a keystroke in the
 * search overlay took several times as long. The renderer's name says which
 * case this is; in software the scrim keeps its dim and drops the blur
 * (`scrim-blur` in globals.css).
 */
export function startBlurCheck() {
  const check = () => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    if (!gl || /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) {
      document.documentElement.setAttribute("data-no-blur", "");
    }
  };
  // A GL context at start-up is time taken from the first page.
  if ("requestIdleCallback" in window) requestIdleCallback(check, { timeout: 2000 });
  else setTimeout(check, 500);
}
