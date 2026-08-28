import { cn } from "@/lib/utils";
import { SIDEFX_DOCS_ROOT } from "@/lib/houdini";

const DONATION_URL = "https://github.com/sponsors/JTCHE?frequency=one-time";

interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn("border-t bg-background text-muted-foreground text-xs py-4 print:py-1.5", className)}>
      <div className="max-w-page mx-auto px-page-x">
        <div className="flex flex-wrap gap-x-0.5 md:gap-x-2 gap-y-1">
          <span className="hidden print:inline font-semibold text-foreground/80">HoudiniMD</span>
          <span
            className="hidden print:inline text-muted-foreground/40"
            aria-hidden
          >
            ∙
          </span>
          <span>
            Built by{" "}
            <a
              href="https://jchd.me"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              John C. ✿
            </a>
          </span>
          <span
            className="text-muted-foreground/40"
            aria-hidden
          >
            ∙
          </span>
          <a
            href={SIDEFX_DOCS_ROOT}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            <span>Docs &copy; SideFX</span>
          </a>
          <span
            className="text-muted-foreground/40 print:hidden"
            aria-hidden
          >
            ∙
          </span>
          <a
            href="https://github.com/JTCHE/houdinimd"
            target="_blank"
            rel="noopener noreferrer"
            className="print:hidden text-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            GitHub
          </a>
          <span
            className="text-muted-foreground/40 print:hidden"
            aria-hidden
          >
            ∙
          </span>
          <a
            href={DONATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="print:hidden text-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            Donate
          </a>
          <span
            className="text-muted-foreground/40 print:hidden"
            aria-hidden
          >
            ∙
          </span>
          <a
            href="https://houdinimd.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="print:hidden text-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            Privacy Policy
          </a>
        </div>
        <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground/60">
          HoudiniMD is an unofficial, independent project, and isn&apos;t affiliated with or endorsed by SideFX.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
