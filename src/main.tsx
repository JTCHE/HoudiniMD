import { StrictMode } from "react";
import { invoke } from "./lib/backend";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import Home from "./routes/Home";
import Page from "./routes/Page";
import { AppShell } from "./components/shell/AppShell";
import { ToastListener } from "./components/ui/toast-notification";
import { startTheme } from "./lib/ui/theme";
import { startPress } from "./lib/ui/press";
import "./styles/globals.css";

// `bun run app --clean` starts the app as a machine that has never run it.
// The index lives in a fresh directory on the Rust side; what the reader kept
// lives here, in the webview, so it is dropped here.
if (await invoke<boolean>("clean_start").catch(() => false)) {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("houdinimd.")) localStorage.removeItem(key);
  }
}

// Light or dark before the first paint, so the window never flashes the
// other theme on the way in.
startTheme();

// An animation that runs against a window nobody is reading is pure cost, so
// the body says when the window is idle and the stylesheet pauses the motion.
// See AGENTS.md, "Animation and compositing".
const idle = () => document.body.setAttribute("data-idle", String(!document.hasFocus()));
window.addEventListener("focus", idle);
window.addEventListener("blur", idle);
idle();

// The webview brings a browser menu with it — reload, inspect, save picture —
// and none of it belongs in a window that draws its own chrome. A field the
// reader types in keeps its menu, because cut, copy and paste live there.
if (import.meta.env.PROD) {
  document.addEventListener("contextmenu", (event) => {
    const at = event.target as HTMLElement | null;
    if (at?.closest("input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
  });
}

// Every control in the window acts on the press from here on — one listener,
// no prop to remember. See lib/ui/press.
startPress();

// Real paths, because Houdini asks for `/nodes/sop/box` flat and the reader
// should see that in the address bar of the help window. The localhost server
// answers any page path with the app; the desktop window never asks for one,
// because it only ever pushes state.
//
// The shell is OUTSIDE the routes, so the title bar and the panel are mounted
// once for the life of the window and only the content column changes.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/*" element={<Page />} />
        </Routes>
      </AppShell>
      <ToastListener />
    </BrowserRouter>
  </StrictMode>,
);
