import { cn } from "@/lib/utils";

const KOFI_URL = "https://ko-fi.com/jtche";

interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn("border-t bg-background text-muted-foreground text-xs py-4", className)}>
      <div className="max-w-4xl mx-auto px-page-x">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <span className="hidden print:inline font-semibold text-foreground/80">HoudiniMD</span>
          <span
            className="hidden print:inline text-muted-foreground/40"
            aria-hidden
          >
            ·
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
            ·
          </span>
          <a
            href="https://www.sidefx.com/docs/"
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
            ·
          </span>
          <a
            href={KOFI_URL}
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
            ·
          </span>
          <a
            href={"mailto:hi@jchd.me?subject=HoudiniMD Feedback"}
            target="_blank"
            rel="noopener noreferrer"
            className="print:hidden text-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            Feedback
          </a>
        </div>
        <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground/60">
          HoudiniMD is an unofficial, independent project, and isn't affiliated with or endorsed by SideFX.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
