import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router";
import Home from "./routes/Home";
import Page from "./routes/Page";
import { ToastListener } from "./components/ui/toast-notification";
import "./styles/globals.css";

// A hash route needs no server rewrite, so the dev server and the packaged
// app resolve a deep link the same way.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/*" element={<Page />} />
      </Routes>
      <ToastListener />
    </HashRouter>
  </StrictMode>,
);
