"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { toTitleCase } from "@/lib/markdown/page-title";
import DocIconClient from "@/components/docs/markdown/DocIconClient";
import type { ImageDimensions } from "@/lib/images/dimensions";

interface PageTitleProps {
  name: string;
  nodeType?: string;
  icon?: string;
  iconDimensions?: ImageDimensions;
}

export function PageTitle({ name, nodeType, icon, iconDimensions }: PageTitleProps) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const separatorRef = useRef<HTMLSpanElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read by the disabled separator below; see the to-do there.
  const [showSeparator, setShowSeparator] = useState(false);

  useLayoutEffect(() => {
    const nameElement = nameRef.current;
    const separatorElement = separatorRef.current;
    if (!nameElement || !separatorElement) return;

    const measure = () => {
      const nameLines = nameElement.getClientRects();
      const nameLine = nameLines[nameLines.length - 1];
      const inline = !!nameLine && Math.abs(nameLine.top - separatorElement.getBoundingClientRect().top) < 1;
      setShowSeparator((current) => (current === inline ? current : inline));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nameElement.parentElement!);
    return () => observer.disconnect();
  }, [name, nodeType]);

  return (
    <div className="flex items-center gap-3 min-w-0">
      {icon && (
        <DocIconClient
          src={icon}
          alt=""
          className="size-8 shrink-0 select-none"
          priority
          {...iconDimensions}
        />
      )}
      <h1 className="text-2xl font-bold tracking-tight leading-tight m-0 wrap-break-word">
        <span ref={nameRef}>{name}</span>
        {nodeType && (
          <>
            <span className="font-extralight text-muted-foreground">
              {/* To do : broken showSeparator logic. Need to improve robustness and bring back separator. */}
              {/* <span
                ref={separatorRef}
                aria-hidden="true"
                className={showSeparator ? "" : "invisible"}
              >
                {" | "}
              </span> */}{" "}
              {toTitleCase(nodeType)}
            </span>
          </>
        )}
      </h1>
    </div>
  );
}
