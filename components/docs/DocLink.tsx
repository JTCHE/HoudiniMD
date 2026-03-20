"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DocTooltip, registerSlug } from "./Tooltip";
import { showToast } from "@/components/ui/toast-notification";

export default function DocLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const slug = href?.startsWith("/docs/") ? href.slice(6).split("#")[0] : null;
  const anchor = href?.includes("#") ? href.slice(href.indexOf("#") + 1) : null;
  const [visible, setVisible] = useState(false);
  const preventNextClick = useRef(false);
  const router = useRouter();
  const isInternal = !!slug;

  useEffect(() => {
    if (slug) registerSlug(slug);
  }, [slug]);

  function show() {
    if (!isInternal) return;
    setVisible(true);
  }

  function hide() {
    setVisible(false);
  }

  return (
    <span className="relative inline-block">
      {/* prefetch={true} tells Next.js to fetch the full RSC payload (not just the loading
          skeleton) when this link enters the viewport. Cached under staleTimes.static (5 min),
          so clicking after it's been visible for even ~30ms is instant with no skeleton. */}
      <Link
        href={href!}
        {...props}
        prefetch={isInternal ? true : undefined}
        onMouseDown={(e) => {
          // Navigate on mousedown (saves the ~100ms between mousedown and click).
          // Only plain left click — let browser handle Ctrl/Meta/Shift (new tab etc.)
          if (!isInternal || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          if (window.location.pathname === `/docs/${slug}`) {
            if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
            showToast("Already on this page");
            preventNextClick.current = true;
            return;
          }
          router.prefetch(href!);
          router.push(href!);
        }}
        onClick={(e) => {
          if (preventNextClick.current) {
            e.preventDefault();
            preventNextClick.current = false;
          }
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </Link>
      {visible && isInternal && <DocTooltip slug={slug!} />}
    </span>
  );
}
