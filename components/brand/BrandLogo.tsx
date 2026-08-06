import { cn } from "@/lib/utils";

/**
 * The Houdini spiral, in the coordinates of the glyph the designer exported for
 * the homepage lockup. The 48 x 60 box keeps the margin around the spiral, so
 * the mark holds the same optical size as the mockup at any height.
 */
const SPIRAL_PATH =
  "M34.1801 49.6352C40.6164 46.1841 44.7278 39.5509 44.7308 30.7305C44.7349 18.0333 35.6017 7.96871 21.2161 7.96059C14.4963 7.95652 8.82189 10.1242 4.46169 13.4746C4.46169 13.4746 3.40909 14.2842 3.40909 16.6556C3.40909 19.0269 4.46169 20.0334 4.46169 20.0334C8.2632 16.0809 13.9315 13.4056 21.2161 13.6574C31.4981 14.0127 38.3396 22.2305 38.3507 30.765C38.3639 40.19 32.5496 46.6259 22.7513 46.5041C16.0771 46.4208 9.57535 41.8459 9.74058 34.8851C9.87244 29.3578 13.7783 24.8865 19.9861 24.7393C25.0024 24.6205 27.0233 28.0897 27.0233 30.2371C27.0233 32.2737 25.8207 34.8983 22.8689 35.5297C20.484 36.0404 17.1114 33.5347 19.6585 30.1172C17.0546 29.9975 14.7832 31.6473 14.6484 34.5683C14.3878 40.2336 20.2487 42.4327 23.9935 41.8307C30.8623 40.7271 33.4074 36.2496 33.375 30.167C33.3415 23.8032 27.5911 18.1734 20.1361 18.0983C14.1687 18.0383 7.04638 21.468 4.46169 28.9436C4.46169 28.9436 3.49681 30.765 3.49681 34.6708C3.49681 38.5767 4.46169 40.3981 4.46169 40.3981C5.84167 43.9991 8.61375 47.3981 12.5366 49.6348C12.5366 49.6348 15.94 51.7867 23.3583 51.7867C30.7767 51.7867 34.1801 49.6352 34.1801 49.6352Z";

/** The "M" letterform of the app icon, in app-icon coordinates. */
const LETTER_M_PATH =
  "M35.3753 251.249C40.8519 251.258 48.4914 250.724 53.7973 251.671C54.7088 251.732 55.8271 253.222 56.2392 254.036C64.9833 271.228 72.0606 289.651 80.5629 306.929C85.4194 295.134 99.5412 265.537 106.033 252.546C106.951 250.707 125.096 250.125 128.079 252.964C129.012 258.146 128.635 336.775 127.754 339.618C125.224 341.38 112.818 341.492 110.68 339.752C109.226 336.892 109.841 310.4 109.849 305.003C109.932 297.219 109.831 289.436 109.546 281.656C103.175 294.751 94.6727 316.03 87.1856 329.091C86.3699 330.517 76.4985 329.866 73.9162 329.776C70.8417 324.818 68.2431 318.244 65.7259 312.89C60.7876 302.384 56.1327 291.486 50.9676 281.109C50.9381 288.234 51.5633 336.203 50.3967 339.338C49.7192 339.985 49.5511 340.398 48.7473 340.488C44.9488 340.906 36.2042 341.578 32.9795 339.636C31.818 335.367 31.6405 257.969 32.7352 253.02C33.8509 251.719 33.7627 251.749 35.3753 251.249Z";

/** The "D" letterform of the app icon, in app-icon coordinates. */
const LETTER_D_PATH =
  "M171.18 251.578C179.011 251.595 184.913 251.54 192.599 253.508C226.426 262.177 233.155 306.487 209.443 329.626C208.53 330.399 207.492 331.224 206.531 331.937C193.61 341.549 180.16 340.255 165.082 340.324C160.001 340.345 154.386 340.63 149.343 340.169C148.467 340.088 147.032 339.713 146.699 338.859C146.123 337.385 145.764 334.887 145.747 333.324C145.61 319.532 145.738 305.727 145.713 291.935C145.7 280.013 145.807 268.078 145.623 256.16C145.58 253.351 146.477 252.325 149.03 251.57L171.18 251.578ZM195.588 273.761C188.166 266.724 174.621 267.596 165.048 267.92C165.001 286.375 164.74 305.595 164.933 324.037C176.586 324.204 187.078 325.501 196.207 317.247C206.421 305.782 207.053 284.633 195.588 273.761Z";

/**
 * Puts the spiral of the glyph box into the app-icon grid: it removes the top
 * inset of the glyph box, then scales the mark to icon size. This lets the two
 * variants share one spiral path.
 */
const SPIRAL_TO_ICON_TRANSFORM = "scale(7.1875) translate(0 -3.09091)";

/** The app icon draws its letters in a group that is offset to the right. */
const LETTERS_OFFSET_TRANSFORM = "translate(19.5 0)";

const MARK_VIEW_BOX = "0 0 48 60";
const ICON_VIEW_BOX = "0 0 384 384";

interface BrandLogoProps {
  /** `mark` shows the spiral alone. `full` shows the complete app icon. */
  variant?: "mark" | "full";
  /** Sets the size of the logo, for example `h-lg w-auto`. */
  className?: string;
  /** Give a title to make the logo a labelled image. Without it, the logo is decorative. */
  title?: string;
}

export function BrandLogo({ variant = "mark", className, title }: BrandLogoProps) {
  const isDecorative = title === undefined;

  return (
    <svg
      viewBox={variant === "full" ? ICON_VIEW_BOX : MARK_VIEW_BOX}
      className={cn("block", className)}
      role={isDecorative ? undefined : "img"}
      aria-hidden={isDecorative ? true : undefined}
      focusable={isDecorative ? "false" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {variant === "full" ? (
        <>
          <rect
            width="384"
            height="384"
            rx="86"
            fill="var(--brand-plate)"
          />
          <g transform={LETTERS_OFFSET_TRANSFORM}>
            <path
              d={SPIRAL_PATH}
              transform={SPIRAL_TO_ICON_TRANSFORM}
              fillRule="evenodd"
              clipRule="evenodd"
              fill="var(--brand)"
            />
            <rect
              x="15.5"
              y="241"
              width="222"
              height="110"
              fill="var(--brand-plate)"
            />
            <path
              d={LETTER_M_PATH}
              fill="var(--foreground)"
            />
            <path
              d={LETTER_D_PATH}
              fillRule="evenodd"
              clipRule="evenodd"
              fill="var(--foreground)"
            />
          </g>
        </>
      ) : (
        <path
          d={SPIRAL_PATH}
          fillRule="evenodd"
          clipRule="evenodd"
          fill="var(--brand)"
        />
      )}
    </svg>
  );
}
