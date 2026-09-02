import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Tauri drives this dev server, so the port is fixed and failures are loud
// rather than silently moving to another port the Rust side does not know.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // The repository root still holds the site-era build folders and the Rust
    // target directory. Watching them starved the dev server, so a request for
    // a module took tens of seconds and the app window opened empty.
    watch: {
      ignored: [
        "**/.next/**",
        "**/.open-next/**",
        "**/.trash/**",
        "**/.wrangler/**",
        "**/dist/**",
        "**/src-tauri/target/**",
        "**/src-tauri/gen/**",
      ],
    },
  },
  build: { target: "esnext", sourcemap: true },
});
