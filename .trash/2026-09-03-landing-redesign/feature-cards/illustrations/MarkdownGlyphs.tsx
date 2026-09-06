/** Markdown mid-decode. A later pass animates the glyphs; the lines stay a
    plain list so motion can key off the index without a rebuild. */
const MARKDOWN_LINES = [
  { text: "# Copy to ! A-a-l-", tone: "text-foreground font-semibold" },
  { text: "## Parameters", tone: "text-foreground font-semibold" },
  { text: "- S0urce Gr!up — p-ints t/ c0py", tone: "text-muted-foreground" },
  { text: "- Targ!t P-ints — wh1ch p0ints", tone: "text-muted-foreground" },
  { text: "- Attr!butes — a-tribut3s t0 c/py", tone: "text-muted-foreground" },
];

export function MarkdownGlyphs() {
  return (
    // The mask dissolves the text into the card on all four edges — the lines
    // run past the right edge as well as past the top and bottom, and a hard
    // cut mid-word reads as a bug rather than as decoding. It carries no colour
    // of its own, so it holds in either theme.
    <div
      aria-hidden
      className="self-stretch w-full px-md py-md flex flex-col justify-start gap-2xs font-mono text-caption whitespace-nowrap select-none pointer-events-none mask-y-from-80% mask-y-to-100% mask-r-from-85% mask-r-to-100%"
    >
      {MARKDOWN_LINES.map((line) => (
        <p
          key={line.text}
          className={line.tone}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
