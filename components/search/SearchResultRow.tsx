"use client";

/**
 * A single result row (icon + title + category) shared by the docs search
 * overlay and the homepage search field, so both render results identically.
 */
export function SearchResultRow({
  title,
  category,
  icon,
  active,
  onClick,
  onMouseMove,
}: {
  title: string;
  category: string;
  icon?: string;
  active: boolean;
  onClick: () => void;
  onMouseMove: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
        active ? "bg-muted" : "hover:bg-muted/50"
      }`}
      onClick={onClick}
      onMouseMove={onMouseMove}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" aria-hidden="true" className="size-5 shrink-0 select-none" />
      ) : (
        // Reserve the icon's space so titles stay left-aligned across rows
        <span className="size-5 shrink-0" aria-hidden="true" />
      )}
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium truncate">{title}</span>
        <span className="text-xs text-muted-foreground truncate">{category}</span>
      </span>
    </button>
  );
}
