"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { AgentDemo } from "@/components/landing/showcase/AgentDemo";
import { Driver, Stopped, timeOpen, type Cues, type Pointer } from "@/components/landing/showcase/driver";
import { F1Demo, pane } from "@/components/landing/showcase/F1Demo";
import { pagesScene, searchScene } from "@/components/landing/showcase/scenes";
import { SpeedDemo } from "@/components/landing/showcase/SpeedDemo";
import { cn } from "@/lib/utils";

/** Every tab is laid out at this size and scaled to fit, so a demo is drawn
    once, in its own pixels, whatever the screen. */
const DESK = { w: 1200, h: 740 };
/** Below this scale the app's text gets too small to read. A smaller screen
    gets a smaller window instead, down to this one, and the app lays itself
    out in it. */
const LEGIBLE = 0.72;
const SMALLEST = { w: 960, h: 560 };
/** A phone gets a narrow tab as tall as the room left, and the app draws its
    own narrow layout in it: close enough to read, rather than a whole window
    too small to. */
const PHONE = 420;
const NARROW = 640;

export interface Base {
  w: number;
  h: number;
  phone: boolean;
}

/** Where the app sits in a tab, in the tab's own pixels, and the size of the
    window the app lays itself out in. */
export interface AppBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The width the app thinks its window is. */
  window: number;
  /** Where the page time shows: the middle of the bar above the page, in
      the tab's pixels. */
  bar: number;
  /** The time sits at the bar's right end, not its middle: the pane's tab
      bar has its name on the left. */
  end?: boolean;
}

export interface DemoProps {
  /** Moves the app to `path`, and times the page `title` if one is given. */
  go: (path: string, title?: string) => void;
  base: Base;
}

/** The app's own title bar, from the app's `--spacing-titlebar`. */
const TITLEBAR = 32;

const full = (base: Base): AppBox => ({ x: 0, y: 0, w: base.w, h: base.h, window: base.w, bar: TITLEBAR / 2 });

interface Tab {
  id: string;
  label: string;
  /** How long the tab stays before the next, when nobody picks one. A tab
      with a scene moves on when its scene ends. */
  ms: number;
  scene?: (d: Driver) => Promise<void>;
  /** Drawn in the frame. A tab with no demo is the app on its own. */
  demo?: ComponentType<DemoProps>;
  /** Where the app is in this tab. No box, no app. */
  app?: (base: Base) => AppBox;
}

const TABS: Tab[] = [
  { id: "search", label: "Search", ms: 15000, scene: searchScene, app: full },
  { id: "pages", label: "Pages", ms: 22000, scene: pagesScene, app: full },
  { id: "f1", label: "Houdini help", ms: 10000, demo: F1Demo, app: pane },
  { id: "agents", label: "Agents", ms: 14000, demo: AgentDemo },
  { id: "speed", label: "Speed", ms: 10000, demo: SpeedDemo },
];

export type ShowcaseTab = (typeof TABS)[number]["id"];

/** The frame's look: the two stacked shadows of a window on a plain page. On
    white the far shadow is a haze, so it is lighter there. */
const FRAME =
  "rounded-[10px] bg-background ring-1 ring-black/10 shadow-[0_0_6px_rgba(0,0,0,0.2),0_50px_120px_rgba(0,0,0,0.14)] dark:ring-white/10 dark:shadow-[0_0_6px_rgba(0,0,0,0.25),0_60px_160px_rgba(0,0,0,0.4)]";

function useFit(area: React.RefObject<HTMLDivElement | null>) {
  const [fit, setFit] = useState<{ scale: number; base: Base } | null>(null);
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = node;
      if (w < NARROW) {
        const scale = w / PHONE;
        setFit({ scale, base: { w: PHONE, h: Math.round(h / scale), phone: true } });
      } else {
        const fits = Math.min(w / DESK.w, h / DESK.h);
        const scale = fits >= LEGIBLE ? fits : Math.max(fits, Math.min(LEGIBLE, w / SMALLEST.w, h / SMALLEST.h));
        const base = { w: Math.min(DESK.w, Math.floor(w / scale)), h: Math.min(DESK.h, Math.floor(h / scale)), phone: false };
        setFit({ scale, base });
      }
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  }, [area]);
  return fit;
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-full drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.45)]"
    >
      <path
        d="M2 1.5v11.2l3-2.9 2 4.7 2.1-.9-2-4.6h4.2z"
        fill="white"
        stroke="black"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Showcase() {
  const area = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const fit = useFit(area);

  const [active, setActive] = useState(0);
  const [touring, setTouring] = useState(true);
  const touringRef = useRef(true);
  touringRef.current = touring;
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ title: string; ms: number; at: number } | null>(null);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const release = useRef<(() => void) | null>(null);
  const scene = useRef<AbortController | null>(null);
  const progress = useRef<HTMLSpanElement>(null);

  const tab = TABS[active];

  /** Moves the app to a page, as its own link would, and times it. */
  const go = useCallback((path: string, title?: string) => {
    const win = frame.current?.contentWindow as (Window & typeof globalThis) | null | undefined;
    if (!win || win.location.pathname === path) return;
    const move = () => {
      const idx = ((win.history.state as { idx?: number } | null)?.idx ?? 0) + 1;
      win.history.pushState({ usr: null, key: Math.random().toString(36).slice(2, 10), idx }, "", path);
      win.dispatchEvent(new win.PopStateEvent("popstate", { state: win.history.state }));
    };
    if (!title) return move();
    void timeOpen(win, title, move).then((ms) => ms && setOpened({ title, ms, at: Date.now() }));
  }, []);

  // In a pane the app is what Houdini's help pane shows: no window of its
  // own, so no title bar. On a phone the page time takes the middle of the
  // title bar, where the build number would crowd it.
  useEffect(() => {
    const root = frame.current?.contentDocument?.documentElement;
    if (!ready || !root) return;
    if (!root.querySelector("style[data-pane]")) {
      const style = root.ownerDocument.createElement("style");
      style.dataset.pane = "";
      style.textContent =
        "html[data-pane] :is(header.h-titlebar, footer.status-scrim) { display: none; }" +
        "html[data-phone] header.h-titlebar > span.text-caption { visibility: hidden; }";
      root.ownerDocument.head.append(style);
    }
    root.toggleAttribute("data-pane", tab.app === pane);
    root.toggleAttribute("data-phone", !!fit?.base.phone);
  }, [ready, tab, fit?.base.phone]);

  const hold = useCallback((on: boolean) => {
    heldRef.current = on;
    setHeld(on);
    if (!on) {
      release.current?.();
      release.current = null;
    }
  }, []);

  const gate = useCallback(
    () =>
      heldRef.current || document.hidden
        ? new Promise<void>((done) => {
            release.current = done;
            // A hidden page has no event to wake it; look again.
            setTimeout(done, 250);
          }).then(() => undefined)
        : Promise.resolve(),
    [],
  );

  const pick = useCallback((index: number) => {
    setTouring(false);
    setActive(index);
  }, []);

  // "Connect your agent" and friends open a tab from outside.
  useEffect(() => {
    const open = (event: Event) => {
      const index = TABS.findIndex((t) => t.id === (event as CustomEvent<string>).detail);
      if (index >= 0) pick(index);
    };
    window.addEventListener("showcase", open);
    return () => window.removeEventListener("showcase", open);
  }, [pick]);

  // A reader who asks for less motion gets the tabs, and no tour.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setTouring(false);
  }, []);

  // The reader's own hand in the app ends the scene: from then on it is theirs.
  // Only a real event is the reader's; the driver's events are not trusted.
  useEffect(() => {
    if (!ready) return;
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const takeOver = (event: Event) => {
      if (!event.isTrusted) return;
      scene.current?.abort();
      setTouring(false);
      if (pointer.current) pointer.current.style.opacity = "0";
    };
    for (const type of ["pointerdown", "keydown", "wheel"]) doc.addEventListener(type, takeOver, true);
    return () => {
      for (const type of ["pointerdown", "keydown", "wheel"]) doc.removeEventListener(type, takeOver, true);
    };
  }, [ready]);

  // The tab's scene, and the move to the next tab.
  useEffect(() => {
    const controller = new AbortController();
    scene.current = controller;
    setKey(null);
    setOpened(null);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw: Pointer = {
      move(x, y, ms) {
        const node = pointer.current;
        if (!node) return;
        node.style.transitionDuration = `${ms}ms, 150ms, 90ms`;
        node.style.translate = `${x}px ${y}px`;
      },
      press(down) {
        if (pointer.current) pointer.current.style.scale = down ? "0.82" : "1";
      },
      show(visible) {
        if (pointer.current) pointer.current.style.opacity = visible ? "1" : "0";
      },
    };
    const cues: Cues = {
      key: setKey,
      opened: (title, ms) => setOpened({ title, ms, at: Date.now() }),
    };

    // The tab's clock: it runs while the tour runs and the reader is not
    // holding the frame, and draws itself into the active tab.
    let elapsed = 0;
    let last = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      if (!heldRef.current && !document.hidden) elapsed += now - last;
      last = now;
      progress.current?.style.setProperty("--progress", String(Math.min(1, elapsed / tab.ms)));
      frameId = requestAnimationFrame(tick);
    };
    if (touringRef.current) frameId = requestAnimationFrame(tick);
    const next = () => {
      if (!controller.signal.aborted && touringRef.current) setActive((index) => (index + 1) % TABS.length);
    };

    let timer = 0;
    if (tab.scene && frame.current && ready && !reduced) {
      const driver = new Driver(frame.current, draw, cues, controller.signal, gate);
      tab
        .scene(driver)
        .then(
          () => undefined,
          (error) => {
            if (!(error instanceof Stopped)) console.error(error);
          },
        )
        .finally(() => {
          draw.show(false);
          if (!controller.signal.aborted) timer = window.setTimeout(next, 600);
        });
    } else if (!tab.scene) {
      const wait = () => {
        if (controller.signal.aborted) return;
        if (elapsed >= tab.ms) next();
        else timer = window.setTimeout(wait, 100);
      };
      if (touringRef.current) wait();
    }

    return () => {
      controller.abort();
      cancelAnimationFrame(frameId);
      clearTimeout(timer);
      draw.show(false);
    };
    // A tour that stops must not restart the scene the reader is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready]);

  // The tour stopping ends the clock, not the scene.
  useEffect(() => {
    if (!touring) progress.current?.style.setProperty("--progress", "0");
  }, [touring]);

  const Demo = tab.demo;
  const base = fit?.base;
  const scale = fit?.scale ?? 0;
  const app = base && tab.app?.(base);
  const whole = !!base && !!app && app.w === base.w && app.h === base.h;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-lg">
      <div
        ref={area}
        className="relative grid min-h-0 w-full flex-1 place-items-center"
      >
        {base && (
          <div
            className="relative"
            style={{ width: base.w * scale, height: base.h * scale }}
          >
            <div
              className={cn("absolute inset-0 overflow-hidden", FRAME)}
              onPointerEnter={() => hold(true)}
              onPointerLeave={() => hold(false)}
              onPointerDown={() => {
                if (!tab.scene) setTouring(false);
              }}
            >
              <div
                className="absolute top-0 left-0 origin-top-left"
                style={{ width: base.w, height: base.h, scale: String(scale) }}
              >
                {Demo && (
                  <div
                    key={tab.id}
                    className="absolute inset-0 animate-in fade-in duration-300"
                  >
                    <Demo
                      go={go}
                      base={base}
                    />
                  </div>
                )}
                <div
                  className={cn(
                    "absolute overflow-hidden transition-[left,top,width,height,opacity] duration-500 ease-[cubic-bezier(0.3,0.7,0.2,1)]",
                    !app && "pointer-events-none opacity-0",
                    app && !whole && "rounded-sm",
                  )}
                  style={app ? { left: app.x, top: app.y, width: app.w, height: app.h } : { left: 0, top: 0, width: base.w, height: base.h }}
                >
                  <div
                    className="absolute top-0 left-0 origin-top-left transition-[scale,width,height] duration-500 ease-[cubic-bezier(0.3,0.7,0.2,1)]"
                    style={{
                      width: app?.window ?? base.w,
                      height: app ? (app.h * app.window) / app.w : base.h,
                      scale: String(app ? app.w / app.window : 1),
                    }}
                  >
                    <iframe
                      ref={frame}
                      src="/demo/app/index.html"
                      title="The HoudiniMD app, running on pages written for this site"
                      className={cn("size-full border-0 bg-background transition-opacity duration-300", !ready && "opacity-0")}
                      onLoad={() => {
                        const doc = frame.current?.contentDocument;
                        // The app has drawn once its shell holds something; a narrow
                        // window has no sidebar, so nothing more particular.
                        const look = () => (doc?.querySelector("#root main, #root input") ? setReady(true) : setTimeout(look, 50));
                        look();
                      }}
                    />
                    <div
                      ref={pointer}
                      aria-hidden
                      className="pointer-events-none absolute top-0 left-0 z-10 -mt-px -ml-px opacity-0 transition-[translate,opacity,scale] ease-[cubic-bezier(0.3,0.7,0.2,1)]"
                      style={{ width: 22, height: 22, translate: "600px 420px" }}
                    >
                      <Arrow />
                    </div>
                  </div>
                </div>
              </div>

              {key && (
                <div className="pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex gap-1.5">
                    {key.split(" ").map((part) => (
                      <kbd
                        key={part}
                        className="min-w-9 rounded-lg border border-white/15 bg-neutral-950/85 px-2.5 py-1.5 text-center font-mono text-[15px] font-medium text-white shadow-lg backdrop-blur-sm dark:bg-black/80"
                      >
                        {part}
                      </kbd>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {opened && app && (
              <div
                className={cn("pointer-events-none absolute z-10 -translate-y-1/2", app.end ? "-translate-x-full" : "-translate-x-1/2")}
                style={{ left: (app.end ? app.x + app.w - 8 : app.x + app.w / 2) * scale, top: app.bar * scale }}
              >
                <Opened
                  key={opened.at}
                  title={base.phone ? null : opened.title}
                  ms={opened.ms}
                  size={Math.max(10.5, 13 * scale * (app.w / app.window))}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex w-full shrink-0 flex-col items-center gap-sm">
        {/* The pages in the frame are ours, not SideFX's: say so under it. */}
        <p className={cn("text-center text-caption text-muted-foreground transition-opacity duration-300", !app && "opacity-0")}>
          The real app, on sample pages written for this site. Yours come from your Houdini install.
        </p>
        <Tabs
          active={active}
          touring={touring}
          held={held}
          progress={progress}
          onPick={pick}
        />
      </div>
    </div>
  );
}

/** The time the last page took, from the press to its paint, in the empty
    middle of the bar above the page. It stays until the next page. On a phone
    the bar has room for the time only. */
function Opened({ title, ms, size }: { title: string | null; ms: number; size: number }) {
  // Sized with the bar it sits in, so it reads as part of the window.
  return (
    <div
      className="flex animate-in items-center gap-[0.45em] rounded-full border border-hairline bg-background px-[0.75em] py-[0.15em] leading-snug whitespace-nowrap text-muted-foreground shadow-sm duration-200 fade-in zoom-in-95"
      style={{ fontSize: size }}
    >
      <span className="size-[0.45em] rounded-full bg-brand" />
      {title && (
        <>
          <span className="text-foreground">{title}</span> opened in
        </>
      )}
      <span className="font-medium text-brand tabular-nums">{ms} ms</span>
    </div>
  );
}

function Tabs({
  active,
  touring,
  held,
  progress,
  onPick,
}: {
  active: number;
  touring: boolean;
  held: boolean;
  progress: React.RefObject<HTMLSpanElement | null>;
  onPick: (index: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  // On a narrow screen the strip scrolls: the active tab moves to its middle.
  useEffect(() => {
    const node = strip.current;
    const tab = node?.children[active] as HTMLElement | undefined;
    if (!node || !tab || node.scrollWidth <= node.clientWidth) return;
    node.scrollTo({ left: tab.offsetLeft - (node.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label="What the app does"
      className="flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-full border border-hairline bg-surface p-1 [scrollbar-width:none] max-sm:mask-x-from-90% max-sm:mask-x-to-100%"
    >
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={index === active}
          onClick={() => onPick(index)}
          className={cn(
            "relative shrink-0 cursor-pointer overflow-hidden rounded-full px-ms py-xs text-label whitespace-nowrap transition-colors",
            index === active
              ? "bg-background text-foreground shadow-sm ring-1 ring-hairline"
              : "text-muted-foreground pointer-hover:text-foreground",
          )}
        >
          {index === active && touring && (
            <span
              ref={progress}
              aria-hidden
              className={cn("absolute inset-x-ms bottom-[3px] h-[2px] origin-left rounded-full bg-brand transition-opacity", held && "opacity-40")}
              style={{ scale: "var(--progress, 0) 1" }}
            />
          )}
          <span className="relative">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
