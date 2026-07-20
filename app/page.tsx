import { HomeSearchField } from "@/components/root/HomeSearchField";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="relative h-screen overflow-hidden flex flex-col justify-center">
      <div className="px-6 max-w-4xl mx-auto w-full">
        <h1 className="text-3xl font-bold tracking-tight leading-6">HoudiniMD</h1>
        <p className="text-muted-foreground mt-2 mb-5">
          Blazing fast, LLM-optimized documentation for SideFX Houdini. <br />
          Type a node name, VEX function, or paste a SideFX URL, and get clean markdown.
        </p>
        <HomeSearchField />
      </div>

      <Footer className="absolute bottom-0 left-0 right-0" />
    </main>
  );
}
