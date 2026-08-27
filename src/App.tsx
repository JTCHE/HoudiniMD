import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** First screen. It proves the webview is up and the Rust side answers. */
export default function App() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("app_version").then(setVersion).catch(() => setVersion(null));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-medium">HoudiniMD</h1>
      <p className="opacity-60">{version ? `v${version}` : "starting"}</p>
    </main>
  );
}
