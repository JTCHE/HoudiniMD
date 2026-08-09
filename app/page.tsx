import { Suspense } from "react";
import { Footer } from "@/components/Footer";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AsciiBackground } from "@/components/root/AsciiBackground";
import { NoiseOverlay } from "@/components/root/NoiseOverlay";
import { QuickLinks } from "@/components/root/QuickLinks";
import { SearchField } from "@/components/root/search-field/SearchField";
import { Carousel } from "@/components/root/carousel/Carousel";
import { FeatureCards } from "@/components/root/feature-cards/FeatureCards";
import { QUICK_LINKS, resolveCollection } from "@/lib/landing/collections";

/**
 * The landing page is static except for one thing: which curated collection the
 * carousel shows. Rebuilding hourly rotates it without making every visit pay
 * for the index parse.
 */
export const revalidate = 3600;

/**
 * Mirrors Carousel's real markup (label row + one row of chip-shaped
 * placeholders) so the reserved height matches what streams in exactly,
 * instead of guessing a pixel value that drifts out of sync with the real
 * component and causes a slight shift when it resolves.
 */
function CarouselSkeleton() {
  return (
    <div className="flex flex-col gap-xs md:gap-ms">
      <div
        className="h-[0.75lh] w-32 animate-pulse rounded bg-muted"
        aria-hidden="true"
      />
      <div className="flex gap-sm -mx-ms">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="inline-flex items-center gap-sm rounded-lg border border-hairline bg-surface px-ms py-sm"
            aria-hidden="true"
          >
            <span className="size-md shrink-0 animate-pulse rounded-xs bg-muted" />
            <span className="h-[0.75lh] w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The carousel is the only part that reads the search index, so it is the only
 * part behind a Suspense boundary. Everything above it — the mark, the type,
 * the quick links, the search field shell — is in the first byte.
 */
async function CarouselSection() {
  try {
    const collection = await resolveCollection(Math.floor(Date.now() / 3_600_000));
    return (
      <>
        {/* Icons are only known once the collection resolves, so hint the
            browser the moment we have the URLs rather than waiting for
            Carousel to render — Next hoists <link> tags anywhere in the tree
            to <head>, so this fetch overlaps the rest of the streamed page. */}
        {collection?.chips.map((chip) => (
          <link
            key={chip.icon}
            rel="preload"
            as="image"
            href={chip.icon}
          />
        ))}
        <Carousel collection={collection} />
      </>
    );
  } catch {
    return null;
  }
}

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Fetch the fixed quick-link icons with the first page resources. */}
      {QUICK_LINKS.map((link) => (
        <link
          key={link.icon}
          rel="preload"
          as="image"
          href={link.icon}
        />
      ))}

      <AsciiBackground />

      <NoiseOverlay />

      <div className="relative flex flex-1 flex-col justify-center py-xl lg:py-lg">
        <div className="mx-auto flex w-full max-w-page flex-col gap-md px-page-x md:gap-lg">
          <header className="flex flex-col gap-2xs">
            <h1 className="flex items-center gap-sm text-display font-semibold text-foreground">
              HoudiniMD
              <BrandLogo className="h-[0.92em] w-auto" />
            </h1>
            <p className="text-lede text-muted-foreground">A clean Markdown mirror of the Houdini docs.</p>
          </header>

          {/* Order is a real design decision, not a discrepancy: a phone reader
              wants the field under their thumb before the categories; a desktop
              reader scans the categories first and drops to the field. */}
          <div className="order-2 lg:order-1">
            <QuickLinks />
          </div>
          <div className="order-1 lg:order-2">
            <SearchField />
          </div>

          <div className="order-3">
            <Suspense fallback={<CarouselSkeleton />}>
              <CarouselSection />
            </Suspense>
          </div>

          <div className="order-4">
            <FeatureCards />
          </div>
        </div>
      </div>

      <Footer className="relative" />
    </main>
  );
}
