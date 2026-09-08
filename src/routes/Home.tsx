import { AsciiBackground } from "@/components/root/AsciiBackground";
import { SearchField } from "@/components/root/search-field/SearchField";
import { LibraryPanel } from "@/components/root/LibraryPanel";
import { useBuild, useUserName } from "@/lib/install";
import { useLibrary } from "@/lib/store/library";

/**
 * What the window opens on.
 *
 * The app is a tool on a machine where the reader already chose it, so the
 * page does not sell anything: it greets, it names the build it reads, it puts
 * the caret in the search field, and it lists the pages the reader was last
 * in. Four things, on one axis, in the middle of the window.
 *
 * The name of the app is NOT here. The title bar says it, on every route.
 */
function greeting(at = new Date()): string {
  const hour = at.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const { version, pageCount } = useBuild();
  const name = useUserName();
  const library = useLibrary();
  // A cold window has no history greeting could refer back to — "Good
  // morning" reads as if the app remembers a reader it has never seen.
  const cold = library.recents.length === 0 && library.bookmarks.length === 0;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden @container">
      {/* The field is a watermark in the top corner rather than a full-bleed
          backdrop: the window already carries a panel and two bars, and a
          pattern behind all of it would be one texture too many. */}
      <AsciiBackground
        glow={false}
        className="absolute top-[-30px] right-[-60px] left-auto h-[374px] w-[660px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]"
      />

      <div className="relative flex min-h-0 flex-1 flex-col justify-center px-lg py-lg">
        <div className="mx-auto flex min-h-0 w-full max-w-hero flex-col gap-xl">
          <div className="flex shrink-0 flex-col gap-lg">
            <header className="flex flex-col gap-xs">
              <h1 className="text-[34px] leading-[36px] font-semibold tracking-[-0.032em] text-neutral-950">
                {cold ? "Welcome to HoudiniMD." : name ? `${greeting()}, ${name}` : greeting()}
              </h1>
              <p className="flex items-center flex-wrap gap-x-sm text-[16px] leading-6 tracking-[-0.012em] text-neutral-500">
                {version === null ? (
                  "Reading the Houdini install…"
                ) : version ? (
                  <>
                    <span>Houdini {version}</span>
                    <span className="before:content-['·'] before:mr-sm @max-xs:before:content-none @max-xs:before:mr-0">
                      {pageCount === null ? "counting pages…" : `${pageCount.toLocaleString()} pages`}
                    </span>
                  </>
                ) : (
                  "No Houdini install found on this machine."
                )}
              </p>
            </header>

            <SearchField />
          </div>

          {/* The list keeps a box of its own size, so the greeting and the
              field sit on the same axis whatever is in the list and whichever
              tab is open. */}
          <LibraryPanel />
        </div>
      </div>
    </main>
  );
}
