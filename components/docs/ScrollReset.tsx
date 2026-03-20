"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollReset() {
  const pathname = usePathname();
  // Disable browser scroll restoration so our manual scrollTo(0,0) always wins
  useEffect(() => {
    history.scrollRestoration = "manual";
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
