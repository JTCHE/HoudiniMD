import { useState, type CSSProperties, type ReactNode } from "react";

/** Pictures the help page wrote side by side — a comparison row, built in
    `image_group` in the parser's `markdown.rs`.

    Every figure conforms to the shortest picture in the row, or the row grows
    a staircase edge. The site probed those heights on the server because the
    pictures came over the network. Here they are files in the install, so the
    browser knows the height about as soon as the row is drawn; the CSS holds a
    fallback height until it does. */
export function ImageGroup({ className, children }: { className: string; children: ReactNode }) {
  const [height, setHeight] = useState<number>();
  return (
    <div
      className={className}
      style={height ? ({ "--image-group-height": `${height}px` } as CSSProperties) : undefined}
      onLoadCapture={(event) => {
        const image = event.target as HTMLImageElement;
        if (image.naturalHeight) {
          setHeight((shortest) => Math.min(shortest ?? Infinity, image.naturalHeight));
        }
      }}
    >
      {children}
    </div>
  );
}
