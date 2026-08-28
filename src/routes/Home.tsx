import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Footer } from "@/components/Footer";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AsciiBackground } from "@/components/root/AsciiBackground";
import { NoiseOverlay } from "@/components/root/NoiseOverlay";
import { QuickLinks } from "@/components/root/QuickLinks";
import { SearchField } from "@/components/root/search-field/SearchField";
import { FeatureCards } from "@/components/root/feature-cards/FeatureCards";

interface Install {
  version: string;
  root: string;
  help: string;
}

/** The landing page. It names the build it reads, because the whole point of
    the app is that the docs match the Houdini that is installed. */
export default function Home() {
  const [installs, setInstalls] = useState<Install[] | null>(null);

  useEffect(() => {
    invoke<Install[]>("installs").then(setInstalls).catch(() => setInstalls([]));
  }, []);

  const version = installs?.[0]?.version;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <AsciiBackground />

      <NoiseOverlay />

      <div className="relative flex flex-1 flex-col justify-center py-xl lg:py-lg">
        <div className="mx-auto flex w-full max-w-page flex-col gap-md px-page-x md:gap-lg">
          <header className="flex flex-col gap-2xs">
            <h1 className="flex items-center gap-sm text-display font-semibold text-foreground">
              HoudiniMD
              <BrandLogo className="h-[0.92em] w-auto" />
            </h1>
            <p className="text-lede text-muted-foreground">
              {installs === null
                ? "Reading the Houdini install…"
                : version
                  ? `Houdini ${version}`
                  : "No Houdini install found on this machine."}
            </p>
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

          <div className="order-4">
            <FeatureCards />
          </div>
        </div>
      </div>

      <Footer className="relative" />
    </main>
  );
}
