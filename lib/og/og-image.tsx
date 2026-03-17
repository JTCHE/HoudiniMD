const BG = "#09090b";
const TEXT = "#fafafa";
const MUTED = "#71717a";
const DIM = "#3f3f46";

export interface OgImageProps {
  title: string;
  subtitle?: string;
  category?: string;
  breadcrumb?: string;
  summary?: string;
  tags?: string[];
  siteUrl?: string;
}

export function buildOgImageJsx({
  title,
  subtitle,
  category,
  breadcrumb,
  summary,
  tags,
  siteUrl = "houdinimd.jchd.me",
}: OgImageProps) {
  const displayTitle = title.length > 42 ? title.slice(0, 39) + "…" : title;
  const displaySummary =
    summary && summary.length > 140 ? summary.slice(0, 137) + "…" : summary;

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: BG,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Brand */}
      <div style={{ color: MUTED, fontSize: 20, fontWeight: 400 }}>
        HoudiniMD
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* Breadcrumb / category line */}
        {(breadcrumb || category) && (
          <div
            style={{
              color: MUTED,
              fontSize: 18,
              marginBottom: 16,
              display: "flex",
              gap: 8,
            }}
          >
            {breadcrumb && <span>{breadcrumb}</span>}
            {breadcrumb && category && (
              <span style={{ color: DIM }}>/</span>
            )}
            {category && <span>{category}</span>}
          </div>
        )}

        {/* Title */}
        <div
          style={{
            color: TEXT,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            marginBottom: subtitle || displaySummary ? 20 : 0,
          }}
        >
          {displayTitle}
        </div>

        {/* Subtitle or summary */}
        {(subtitle || displaySummary) && (
          <div
            style={{
              color: MUTED,
              fontSize: 26,
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

      {/* Footer: URL */}
      <div style={{ color: DIM, fontSize: 18 }}>{siteUrl}</div>
    </div>
  );
}
