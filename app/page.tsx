import { ArrowUpRight } from "lucide-react";
import { ViewRecorder } from "@/components/ViewRecorder";
import { AppIcon } from "@/components/landing/AppIcon";
import { Showcase } from "@/components/landing/showcase/Showcase";
import { ThemeToggle } from "@/components/landing/ThemeToggle";
import { DownloadKey } from "@/components/ui/download-key";
import { MCP_URL, REPO_URL, SITE_NAME } from "@/lib/brand";

export const revalidate = false;

/** One screen, no scroll: what the app is, how to get it, and the app itself.
    The header sizes by the screen's height, so a short screen keeps its room
    for the app. */
export default function Home() {
  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      <ViewRecorder path="/" />
      <ThemeToggle className="absolute top-sm right-sm z-10" />

      <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col items-center gap-lg px-page-x pt-lg pb-md">
        <header className="flex shrink-0 flex-col items-center text-center">
          <h1 className="flex items-center gap-[0.2em] text-[clamp(34px,6vh,50px)] leading-none max-sm:text-[36px] font-semibold tracking-[-0.04em] text-foreground">
            <AppIcon className="size-[1.16em]" />
            {SITE_NAME}
          </h1>
          <p className="mt-[clamp(10px,1.8vh,18px)] text-[clamp(19px,3vh,27px)] leading-tight max-sm:text-[19px] font-semibold tracking-[-0.025em] text-foreground">
            The Houdini docs, instant and offline.
          </p>
          <p className="mt-xs max-w-[34rem] text-[clamp(15px,2vh,17px)] leading-normal max-sm:text-[14px] text-muted-foreground">
            Houdini&apos;s help takes seconds to open a page. This free,{" "}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-hairline underline-offset-4 transition-colors hover:decoration-foreground"
            >
              open-source
            </a>{" "}
            app opens the same docs, from your install, in a tenth of a second.
          </p>
          <div className="mt-[clamp(12px,2.2vh,22px)] flex flex-wrap items-center justify-center gap-x-md gap-y-sm">
            <DownloadKey />
            <a
              href={MCP_URL}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-1 text-label font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Connect your agent
              <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-px group-hover:-translate-y-px" />
            </a>
          </div>
        </header>

        <Showcase />
      </div>

      <footer className="relative shrink-0 pb-sm text-center text-caption text-muted-foreground">
        {`${SITE_NAME} is an unofficial, independent project, and isn't affiliated with or endorsed by SideFX.`}
      </footer>
    </main>
  );
}
