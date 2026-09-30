"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import type { DemoProps } from "@/components/landing/showcase/Showcase";
import { MCP_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** One turn of an agent with the Houdini MCP. The tool names are the MCP's
    own; the words are ours, not a quote of any page. */
const TURN: { kind: "user" | "tool" | "result" | "agent"; text: string }[] = [
  { kind: "user", text: "Scatter points on the mesh, denser where @mask is high." },
  { kind: "tool", text: 'docs  page="nodes/sop/scatter"  section="Density"' },
  { kind: "result", text: "12 lines of Markdown from HoudiniMD, out of your Houdini 21.0 install" },
  { kind: "tool", text: 'node_edit  create="scatter"  parent="/obj/geo1"' },
  { kind: "tool", text: 'parm_set  node="scatter1"  densityattrib="mask"' },
  { kind: "tool", text: "capture  viewport" },
  { kind: "agent", text: "Done. scatter1 reads @mask as its density: the points gather where the mask is high." },
];

const CLIENTS = ["Claude Code", "Codex", "Gemini", "Cursor", "opencode", "pi"];

/** The MCP's install, per system, as its README gives it. */
const INSTALL = [
  {
    id: "windows",
    label: "Windows",
    command:
      'powershell -c "irm https://raw.githubusercontent.com/JTCHE/houdini-mcp/main/bootstrap.bat -OutFile bootstrap.bat; .\\bootstrap.bat"',
  },
  { id: "unix", label: "macOS · Linux", command: "curl -sSL https://raw.githubusercontent.com/JTCHE/houdini-mcp/main/bootstrap.sh | bash" },
  { id: "uv", label: "uv", command: "uv tool install houdini-mcp-server && houdinimcp-install" },
];

/** The viewport the agent captured: points on a shape, denser at the top.
    Drawn here, from a fixed seed, so every visit gets the same picture. */
function Capture() {
  const points: [number, number][] = [];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (points.length < 260) {
    const x = random();
    const y = random();
    if (random() < 1.1 - y) points.push([x, y]);
  }
  return (
    <svg
      viewBox="0 0 1 0.56"
      className="h-[112px] w-[200px] rounded-md bg-[oklch(0.24_0_0)] ring-1 ring-white/10"
    >
      <g transform="translate(0.14 0.06) scale(0.72 0.44)">
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={0.006}
            fill="oklch(0.78 0.16 60)"
          />
        ))}
      </g>
    </svg>
  );
}

export function AgentDemo({ base }: DemoProps) {
  const { phone } = base;
  const [shown, setShown] = useState(0);
  const [system, setSystem] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(TURN.length);
      return;
    }
    const id = setInterval(() => setShown((n) => Math.min(TURN.length, n + 1)), 1100);
    return () => clearInterval(id);
  }, []);

  const copy = () => {
    void navigator.clipboard?.writeText(INSTALL[system].command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className={cn("grid h-full", phone ? "grid-rows-[1fr_auto] gap-5 p-5" : "grid-cols-[1fr_380px] items-center gap-10 p-12")}>
      <div className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl", !phone && "self-start", " bg-[oklch(0.16_0_0)] font-mono leading-relaxed", phone ? "text-[13px]" : "text-[15px]", "text-white/80 shadow-[0_0_4px_rgba(0,0,0,0.3),0_24px_60px_rgba(0,0,0,0.3)] ring-1 ring-white/10")}>
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          <span className="size-3 rounded-full bg-white/15" />
          <span className="size-3 rounded-full bg-white/15" />
          <span className="size-3 rounded-full bg-white/15" />
          <span className="ml-3 text-[13px] text-white/45">~/shots/sh010 — your agent</span>
        </div>
        {/* New lines come in at the bottom, as in a terminal: on a phone the
            first ones leave by the top. */}
        <div className={cn("flex min-h-0 flex-1 flex-col justify-end gap-3", phone ? "p-4" : "p-6")}>
          {TURN.slice(0, shown).map((line, i) => (
            <div
              key={i}
              className="animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              {line.kind === "user" && (
                <p className="rounded-md bg-white/[0.06] px-3 py-2 text-white">
                  <span className="mr-2 text-white/40">&gt;</span>
                  {line.text}
                </p>
              )}
              {line.kind === "tool" && (
                <p className="text-white/85">
                  <span className="mr-2 text-brand-bright">●</span>
                  <span className="text-brand-bright">houdini</span>
                  <span className="text-white/35"> · </span>
                  {line.text}
                </p>
              )}
              {line.kind === "result" && <p className="pl-5 text-white/45">⎿ {line.text}</p>}
              {line.kind === "agent" && (
                <p className="text-white/90">
                  <span className="mr-2 text-white/40">●</span>
                  {line.text}
                </p>
              )}
              {line.kind === "tool" && line.text.startsWith("capture") && (
                <div className="mt-2 pl-5">
                  <Capture />
                </div>
              )}
            </div>
          ))}
          {shown < TURN.length && <span className="h-4 w-2 bg-white/60" />}
        </div>
      </div>

      {phone ? (
        <a
          href={MCP_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-[15px] font-medium text-foreground"
        >
          <span>
            <span className="block">The Houdini MCP</span>
            <span className="block text-[13px] font-normal text-muted-foreground">Claude Code, Codex, Gemini, Cursor, opencode, pi</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0" />
        </a>
      ) : (
      <div className="flex min-w-0 flex-col gap-7">
        <div>
          <h3 className="text-[30px] leading-tight font-semibold tracking-tight text-foreground">
            Your agent reads the docs, then drives Houdini.
          </h3>
          <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
            The docs of the build you run, as clean Markdown. No web pages to scrape, no guessing at a parameter
            name.
          </p>
        </div>

        <p className="-mt-3 text-[14px] text-muted-foreground">Works with {CLIENTS.join(", ")}.</p>

        <div className="rounded-xl border border-hairline bg-surface">
          <div
            role="tablist"
            className="flex gap-1 border-b border-hairline px-2 pt-2"
          >
            {INSTALL.map((option, i) => (
              <button
                key={option.id}
                role="tab"
                type="button"
                aria-selected={i === system}
                onClick={() => setSystem(i)}
                className={cn(
                  "-mb-px cursor-pointer border-b px-3 py-2 text-[13px] transition-colors",
                  i === system ? "border-foreground text-foreground" : "border-transparent text-muted-foreground pointer-hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copy}
            className="group flex w-full cursor-pointer items-start gap-3 p-4 text-left"
          >
            <code className="line-clamp-2 min-w-0 flex-1 font-mono text-[13px] leading-relaxed break-all text-foreground">
              {INSTALL[system].command}
            </code>
            <span className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
              {copied ? <Check className="size-4 text-brand" /> : <Copy className="size-4" />}
            </span>
          </button>
        </div>

        <a
          href={MCP_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[14px] font-medium text-foreground underline decoration-hairline underline-offset-4 transition-colors hover:decoration-foreground"
        >
          The Houdini MCP on GitHub
          <ArrowUpRight className="size-4" />
        </a>
      </div>
      )}
    </div>
  );
}
