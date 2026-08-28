import { Keycap } from "@/components/root/feature-cards/Keycap";

/** The search shortcut, as two keys. */
export function Shortcut() {
  return (
    <div
      aria-hidden
      className="flex items-center gap-sm select-none pointer-events-none"
    >
      <Keycap>⌘</Keycap>
      <Keycap>K</Keycap>
    </div>
  );
}
