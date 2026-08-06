import { cn } from "@/lib/utils";
import { FeatureCard } from "@/components/root/feature-cards/FeatureCard";
import { SpeedBars } from "@/components/root/feature-cards/illustrations/SpeedBars";
import { Shortcut } from "@/components/root/feature-cards/illustrations/Shortcut";
import { HelpPane } from "@/components/root/feature-cards/illustrations/HelpPane";
import { MarkdownGlyphs } from "@/components/root/feature-cards/illustrations/MarkdownGlyphs";

interface FeatureCardsProps {
  className?: string;
}

export function FeatureCards({ className }: FeatureCardsProps) {
  return (
    <section className={cn("flex flex-col gap-xs md:gap-ms", className)}>
      <h2 className="text-label font-semibold text-foreground">Features</h2>

      <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-sm -mx-md", className)}>
        <FeatureCard
          title="Blazing fast navigation"
          caption="Prerendered pages, instant navigation"
        >
          <SpeedBars />
        </FeatureCard>
        <FeatureCard
          title="Keyboard-native"
          caption="⌘K to search, ⌘C to copy, ⌘S for source."
        >
          <Shortcut />
        </FeatureCard>
        <FeatureCard
          title="Right inside Houdini"
          caption="Press F1 on any node. One-time setup."
        >
          <HelpPane />
        </FeatureCard>
        <FeatureCard
          title="Markdown, not HTML"
          caption="Same source for you and your agents."
        >
          <MarkdownGlyphs />
        </FeatureCard>
      </div>
    </section>
  );
}
