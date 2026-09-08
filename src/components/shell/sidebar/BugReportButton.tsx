/**
 * The button that files a bug, in the corner the settings button gave up.
 *
 * It opens the issue form on GitHub in the reader's own browser. The modal the
 * spec describes — title, body, up to five compressed pictures — needs a place
 * to send a report to, and that place is not decided yet. Until it is, GitHub
 * is the place, and it costs nothing to run.
 *
 * See spec: Bug Filing Button.
 */
import { Icons } from "@/lib/ui/icons";

const ISSUES = "https://github.com/JTCHE/HoudiniMD/issues/new";

/* The same shape as the theme switch beside it. A different size or a
   different weight would read as two families of control in one corner. */
const FOOTER_BUTTON =
  "grid size-[30px] cursor-interactive place-items-center rounded-md text-neutral-500 " +
  "transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
  "pointer-hover:bg-raised pointer-hover:text-neutral-800 " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function BugReportButton() {
  return (
    <a
      href={ISSUES}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="File a bug"
      title="File a bug on GitHub"
      className={FOOTER_BUTTON}
    >
      <Icons.bugReport
        strokeWidth="1.5"
        className="size-4.5"
      />
    </a>
  );
}
