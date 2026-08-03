import { toTitleCase } from "@/lib/markdown/page-title";
import { SITE_URL } from "@/lib/site";

const TEXT = "#18181b";
const MUTED = "#71717a";
const DIM = "#d4d4d8";
/** Separator rule: half the width is the gap on each side. */
const SEPARATOR_WIDTH = 40;
const GRADIENT = "radial-gradient(circle at 15% 0%, #f8f8f8 0%, #e0e0e0 100%)";

export interface OgImageProps {
  /** Page name, rendered exactly as scraped — never Title Cased. */
  title: string;
  /** Page kind (e.g. "geometry node"), Title Cased, smaller and lighter than
   *  the name so it reads as a qualifier — same hierarchy as the on-page
   *  header (see components/docs/PageHeader.tsx). */
  nodeType?: string;
  subtitle?: string;
  category?: string;
  summary?: string;
  tags?: string[];
  icon?: string;
}

/** Satori has no text metrics, so estimate the title row width from the glyph
 *  count. Geist averages ~0.52em per glyph at these weights. */
function titleRowFits(title: string, nodeType: string, hasIcon: boolean) {
  const available = 1200 - 72 * 2 - (hasIcon ? 96 + 24 : 0);
  return title.length * 44 + SEPARATOR_WIDTH + toTitleCase(nodeType).length * 21 < available;
}

export function buildOgImageJsx({ title, nodeType, subtitle, category, summary, tags, icon }: OgImageProps) {
  const displayTitle = title.length > 42 ? title.slice(0, 39) + "…" : title;
  const displaySummary = summary && summary.length > 140 ? summary.slice(0, 137) + "…" : summary;
  const inlineType = !!nodeType && titleRowFits(displayTitle, nodeType, !!icon);

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: GRADIENT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px",
        fontFamily: "Geist",
      }}
    >
      {/* Brand — big favicon, then a thin "| HoudiniMD", sized to the icon. */}
      <div style={{ display: "flex", gap: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${SITE_URL}/icon.svg`}
          width={56}
          height={56}
          alt=""
        />
        <span style={{ color: MUTED, fontSize: 45, fontWeight: 200, letterSpacing: -3 }}>| HoudiniMD</span>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {category && <div style={{ color: MUTED, fontSize: 18, marginBottom: 16 }}>{category}</div>}

        {/* Title (+ page icon, if it has one) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: subtitle || displaySummary ? 24 : 0,
          }}
        >
          {icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={icon}
              width={96}
              height={96}
              alt=""
            />
          )}
          <div
            style={{
              display: "flex",
              flexDirection: inlineType ? "row" : "column",
              alignItems: inlineType ? "flex-end" : "flex-start",
              fontSize: 84,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            <span style={{ color: TEXT, fontWeight: 500 }}>{displayTitle}</span>
            {nodeType && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: MUTED,
                  fontWeight: 300,
                  fontSize: 40,
                  height: 64,
                  marginLeft: inlineType ? SEPARATOR_WIDTH / 2 : 0,
                  paddingLeft: inlineType ? SEPARATOR_WIDTH / 2 : 0,
                  borderLeft: inlineType ? `2px solid ${DIM}` : "none",
                }}
              >
                {toTitleCase(nodeType)}
              </span>
            )}
          </div>
        </div>

        {/* Subtitle or summary */}
        {(subtitle || displaySummary) && (
          <div
            style={{
              color: MUTED,
              fontSize: 26,
              fontWeight: 300,
              lineHeight: 1.5,
              maxWidth: 900,
              marginBottom: tags && tags.length > 0 ? 32 : 0,
            }}
          >
            {subtitle ?? displaySummary}
          </div>
        )}

        {/* Tags (home variant) */}
        {tags && tags.length > 0 && (
          <div style={{ display: "flex", gap: 12 }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  color: MUTED,
                  fontSize: 15,
                  fontWeight: 500,
                  border: `1px solid ${DIM}`,
                  padding: "4px 12px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
