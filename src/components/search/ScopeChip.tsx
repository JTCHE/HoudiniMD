import type { Scope } from "@/lib/scope";

/** The part of the docs a shorthand keeps the search to, drawn in the field
    before the words. See lib/scope. */
export function ScopeChip({ scope }: { scope: Scope }) {
  return (
    <span className="shrink-0 rounded-md border border-hairline bg-muted px-1.5 py-0.5 text-caption font-medium whitespace-nowrap text-foreground">
      {scope.label}
    </span>
  );
}
