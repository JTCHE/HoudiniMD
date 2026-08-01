"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // In dev the SW caches /docs/* HTML, which points at hashed chunk URLs that
    // change on every recompile. A hard navigation then serves stale HTML with
    // dead chunks. Unregister instead of registering, so an SW installed by an
    // earlier prod build cannot poison the dev server either.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    // The stale-chunk reload that pairs with this lives inline in layout.tsx —
    // it has to run even when the chunks 404 and React never boots.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
