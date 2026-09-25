/**
 * Settings, over the page the reader is on, not in place of it.
 *
 * Every section is the same shape: a title, a line on what it is for, and rows
 * of label, state and control, so no part reads as a different app. A setting
 * is read from the backend each time the dialog opens, never cached, so it
 * says what is true now: a Houdini installed since the setup, an agent that
 * got Houdini MCP from somewhere else.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke, inTauri } from "@/lib/backend";
import { isCommand, useHotkey } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import { Modal, MODAL_LINE, MODAL_TOP } from "@/components/ui/Modal";
import { SidebarRow } from "@/components/shell/sidebar/SidebarRow";
import { Toggle } from "@/components/ui/Toggle";
import { CHOICE_HANG, ChoiceRow } from "@/components/onboarding/ChoiceRow";
import { showToast } from "@/components/ui/toast-notification";
import { TELEMETRY } from "@/components/onboarding/Onboarding";
import { VaultPicker } from "@/components/obsidian/ObsidianDialog";
import { OBSIDIAN_PICTURES, OBSIDIAN_VAULT, picturesChoice, rememberedVault, type PicturesChoice } from "@/lib/obsidian";

const OPEN = "houdinimd:settings";

export function openSettings() {
  window.dispatchEvent(new Event(OPEN));
}

const SECTIONS = [
  { key: "houdini", label: "Houdini", icon: Icons.groupNodes },
  { key: "mcp", label: "Houdini MCP", icon: Icons.newWindow },
  { key: "obsidian", label: "Obsidian", icon: Icons.bookmark },
  { key: "usage", label: "Usage data", icon: Icons.recent },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

/** Mounted once, in the shell. */
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<SectionKey>("houdini");
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);
  // Ctrl or ⌘ with a comma, as in most desktop apps.
  useHotkey((event) => {
    if (event.key !== "," || !isCommand(event) || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpen(true);
  });
  if (!open) return null;

  return (
    <Modal label="Settings" onClose={() => setOpen(false)} className="h-[min(560px,100%)] w-full max-w-[760px] flex-row">
      {/* The panel's own rows, on the panel's own ground: the sections are
          places, as the sidebar's rows are. */}
      <nav className={cn("flex w-[190px] shrink-0 flex-col gap-2xs border-r border-hairline bg-neutral-100 px-ms pb-ms", MODAL_TOP)}>
        <span className={cn(MODAL_LINE, "px-sm text-caption text-neutral-500")}>Settings</span>
        {SECTIONS.map((section) => (
          <SidebarRow
            key={section.key}
            label={section.label}
            selected={shown === section.key}
            mark={<section.icon className={cn("size-[15px]", shown === section.key ? "text-brand" : "text-neutral-500")} />}
            onClick={() => setShown(section.key)}
          />
        ))}
      </nav>
      <div className={cn("min-w-0 flex-1 overflow-y-auto px-xl pb-lg", MODAL_TOP)}>
        {!inTauri ? (
          <p className="text-meta text-neutral-500">Settings live in the HoudiniMD app, not in Houdini's help pane.</p>
        ) : shown === "houdini" ? (
          <HelpSection />
        ) : shown === "mcp" ? (
          <McpSection />
        ) : shown === "obsidian" ? (
          <ObsidianSection />
        ) : (
          <UsageSection />
        )}
      </div>
    </Modal>
  );
}

function Section({ title, detail, action, children }: { title: string; detail: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-md">
      <header className="flex flex-col gap-2xs">
        {/* The close button sits at the end of this line. */}
        <div className={cn(MODAL_LINE, "gap-md pr-lg")}>
          <h2 className="min-w-0 flex-1 text-[17px] font-semibold tracking-[-0.01em] text-neutral-950">{title}</h2>
          {action}
        </div>
        <p className="text-meta text-neutral-500">{detail}</p>
      </header>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** One setting: what it is, what it says now, and its control. */
function Row({ label, detail, children }: { label: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cn(ROW, "flex items-center gap-md")}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium text-neutral-950">{label}</span>
        {detail && <span className="text-caption text-neutral-500">{detail}</span>}
      </div>
      {children}
    </div>
  );
}

/** A row of a section. Its line runs past the text on both sides, as a
    list of chips hangs past it (`CHOICE_HANG`). */
const ROW = "-mx-ms border-b border-hairline px-ms py-ms last:border-b-0";

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-ms text-meta text-neutral-500">{children}</p>;
}

const TEXT_BUTTON =
  "shrink-0 cursor-interactive rounded-md text-meta text-brand-700 underline-offset-2 " +
  "pointer-hover:underline disabled:cursor-wait disabled:text-neutral-400 " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const SMALL_BUTTON =
  "shrink-0 cursor-interactive rounded-md border border-hairline bg-raised px-sm py-[5px] text-[13px] font-medium text-neutral-800 shadow-chip " +
  "transition-colors duration-(--duration-fast) motion-reduce:transition-none pointer-hover:bg-neutral-100 " +
  "disabled:cursor-wait disabled:text-neutral-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

interface Release {
  release: string;
  url: string | null;
  /** Whether the release uses an external help server at all. */
  external: boolean;
  ours: boolean;
}

/** F1 in each Houdini release installed on the machine. */
function HelpSection() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const load = useCallback(() => {
    void invoke<Release[]>("houdini_releases")
      .then(setReleases)
      .catch(() => setReleases([]));
  }, []);
  useEffect(load, [load]);

  async function flip(release: string, on: boolean) {
    try {
      await invoke(on ? "hook_houdini" : "unhook_houdini", { releases: [release] });
      showToast(on ? `F1 in Houdini ${release} now opens HoudiniMD. Restart Houdini.` : `F1 in Houdini ${release} opens its own help again.`);
    } catch (reason) {
      showToast(String(reason), "error");
    }
    load();
  }

  return (
    <Section title="F1 in Houdini" detail="Which installed Houdini releases open their help here when you press F1.">
      {releases?.length === 0 && <Empty>No installed Houdini found on this machine.</Empty>}
      {releases?.map((one) => (
        <Row
          key={one.release}
          label={`Houdini ${one.release}`}
          detail={!one.external || !one.url ? "Opens Houdini's own help" : one.ours ? "Opens HoudiniMD" : `Opens ${one.url}`}
        >
          <Toggle checked={one.external && one.ours} onChange={(next) => void flip(one.release, next)} label={`Houdini ${one.release}`} />
        </Row>
      ))}
    </Section>
  );
}

interface Agent {
  key: string;
  label: string;
  /** What the agent's own config says. See `mcp::Link`. */
  link: "ours" | "other" | "none";
}

const LINK: Record<Agent["link"], string> = {
  ours: "Connected",
  other: "Runs another Houdini MCP",
  none: "Not connected",
};

/** Houdini MCP, read from each agent's own config: the truth, whoever installed it. */
function McpSection() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [busy, setBusy] = useState("");

  const scan = useCallback(() => {
    setAgents(null);
    void invoke<Agent[]>("mcp_agents")
      .catch(() => [])
      .then(setAgents);
  }, []);
  useEffect(scan, [scan]);

  async function install(agent: Agent) {
    setBusy(agent.key);
    try {
      await invoke("install_houdini_mcp", { agent: agent.key });
      showToast(`Houdini MCP is connected to ${agent.label}. Restart Houdini and ${agent.label}.`);
      scan();
    } catch (reason) {
      showToast(`Houdini MCP did not install: ${String(reason)}`, "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <Section
      title="Houdini MCP"
      detail="Lets an AI agent drive Houdini and read these docs from the local index, so it answers about the Houdini build you have installed."
      action={
        <button type="button" disabled={agents === null} className={TEXT_BUTTON} onClick={scan}>
          Scan again
        </button>
      }
    >
      {agents === null && <Empty>Looking for agents…</Empty>}
      {agents?.length === 0 && (
        <Empty>
          No supported agent found on this machine. Houdini MCP works with Claude, Codex, Gemini CLI, Cursor, opencode and
          pi. Install one, then scan again.
        </Empty>
      )}
      {agents?.map((agent) => (
        <Row
          key={agent.key}
          label={agent.label}
          detail={
            <span className={cn("inline-flex items-center gap-2xs", agent.link === "ours" && "text-brand-700")}>
              {agent.link === "ours" && <Icons.chosen className="size-3" />}
              {LINK[agent.link]}
            </span>
          }
        >
          <button type="button" disabled={busy !== ""} className={SMALL_BUTTON} onClick={() => void install(agent)}>
            {busy === agent.key ? "Installing…" : agent.link === "ours" ? "Update" : "Connect"}
          </button>
        </Row>
      ))}
    </Section>
  );
}

/** What Send to Obsidian does with a page's pictures, and which vault they go to. */
function ObsidianSection() {
  const [choice, setChoice] = useState<PicturesChoice | null>(null);
  const [vault, setVault] = useState<string | null>(null);
  useEffect(() => {
    void picturesChoice().then(setChoice);
    void rememberedVault().then(setVault);
  }, []);

  async function pick(next: PicturesChoice) {
    await invoke("set_setting", { key: OBSIDIAN_PICTURES, value: next });
    setChoice(next);
  }
  async function keep(path: string) {
    await invoke("set_setting", { key: OBSIDIAN_VAULT, value: path });
    setVault(path);
  }

  const choices: { value: PicturesChoice; label: string }[] = [
    { value: "ask", label: "Ask each time" },
    { value: "bring", label: "Bring them" },
    { value: "text", label: "Text only" },
  ];
  return (
    <Section title="Obsidian" detail="Send to Obsidian sends a page with no pictures as text. For a page with pictures, it can write the pictures into your vault too.">
      <div className={cn(ROW, "flex flex-col gap-sm")}>
        <span className="text-[14px] font-medium text-neutral-950">Pictures</span>
        <div role="radiogroup" aria-label="Pictures" className={cn(CHOICE_HANG, "flex flex-wrap gap-sm")}>
          {choice &&
            choices.map((one) => (
              <ChoiceRow key={one.value} compact label={one.label} chosen={choice === one.value} onClick={() => void pick(one.value)} />
            ))}
        </div>
      </div>
      <div className={cn(ROW, "flex flex-col gap-sm")}>
        <span className="flex flex-col">
          <span className="text-[14px] font-medium text-neutral-950">Vault</span>
          <span className="text-caption text-neutral-500">Where the pictures go. Obsidian's own vaults are listed first.</span>
        </span>
        <VaultPicker value={vault} onChange={(path) => void keep(path)} />
      </div>
    </Section>
  );
}

/** The telemetry switch, one click from off at any time. */
function UsageSection() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    void invoke<string | null>("get_setting", { key: TELEMETRY })
      .then((value) => setOn(value === "true"))
      .catch(() => {});
  }, []);

  async function flip(next: boolean) {
    await invoke("set_setting", { key: TELEMETRY, value: String(next) });
    setOn(next);
  }

  return (
    <Section title="Usage data" detail="Anonymous timings and counts of how the app is used. No page, no search and no file path leaves the machine.">
      <Row
        label="Send anonymous usage data"
        detail={
          <button
            type="button"
            className={TEXT_BUTTON}
            onClick={() => void invoke("show_telemetry_log").catch((reason) => showToast(String(reason), "error"))}
          >
            See what is sent
          </button>
        }
      >
        {on !== null && <Toggle checked={on} onChange={(next) => void flip(next)} label="Send anonymous usage data" />}
      </Row>
    </Section>
  );
}
