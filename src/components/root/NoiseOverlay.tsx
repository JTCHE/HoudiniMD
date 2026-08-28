const NOISE_TILE_SIZE = 100;
const NOISE_FREQUENCY = 0.8;
const NOISE_OCTAVES = 4;
const NOISE_CONTRAST = 0.5;
const OVERLAY_OPACITY = 1;
const NOISE_FRAME_DURATION = 220;
const NOISE_STEPS = 4;

function buildNoiseImage() {
  const seeds = Array.from({ length: NOISE_STEPS }, (_, index) => index + 1).join(";");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NOISE_TILE_SIZE}" height="${NOISE_TILE_SIZE}"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="${NOISE_FREQUENCY}" numOctaves="${NOISE_OCTAVES}" seed="1" stitchTiles="stitch"><animate attributeName="seed" values="${seeds}" dur="${NOISE_FRAME_DURATION}ms" calcMode="discrete" repeatCount="indefinite"/></feTurbulence></filter><rect width="100%" height="100%" filter="url(#noise)" opacity="${NOISE_CONTRAST}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const NOISE_IMAGE = buildNoiseImage();

export function NoiseOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-10"
      style={{ backgroundImage: NOISE_IMAGE, mixBlendMode: "soft-light", opacity: OVERLAY_OPACITY }}
    />
  );
}
