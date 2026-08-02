import type { Components } from "react-markdown";

/** Inline SideFX icons render at text size (.doc-icon); everything else is a block figure. */
export const Image: Components["img"] = ({ src, alt }) => {
  if (!src || typeof src !== "string") return null;
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={/icons\//.test(src) ? "doc-icon" : "max-w-full h-auto my-4 block"}
    />
  );
};
