import { useCallback, useEffect, useState } from "react";
import { invoke, inTauri } from "@/lib/backend";
import { DISPLAY_TITLE } from "@/lib/ui/type";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/ui/toast-notification";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SettingRow } from "@/components/onboarding/SettingRow";
import { ChoiceRow } from "@/components/onboarding/ChoiceRow";
import { TELEMETRY } from "@/components/onboarding/Onboarding";

/**
 * What the setup asked once, asked again whenever the reader wants.
 *
 * A setting here is read from the backend each time the screen opens, never
 * cached, so it says what is true now: a Houdini release installed since the
 * setup, an agent installed since the setup.
 */
export default function Settings() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-statusbar">
      <div className="mx-auto flex w-full max-w-hero flex-col gap-2xl px-lg py-2xl">
        <h1 className={DISPLAY_TITLE}>Settings</h1>
        {inTauri ? (
          <>
            <HelpSection />
            <McpSection />
            <UsageSection />
          </>
        ) : (
          <p className="text-meta text-neutral-500">Settings live in the HoudiniMD app, not in Houdini's help pane.</p>
        )}
      </div>
    </main>
  );
}

function Section({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-md border-t border-hairline pt-lg">
      <header className="flex flex-col gap-2xs">
        <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-neutral-950">{title}</h2>
        <p className="text-meta text-neutral-500">{detail}</p>
      </header>
      {children}
    </section>
  );
}

const TEXT_BUTTON =
  "cursor-interactive rounded-md text-meta text-brand-700 underline-offset-2 " +
  "pointer-hover:underline disabled:cursor-wait disabled:text-neutral-400 " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

interface Release {
  release: string;
  url: string | null;
  /** Whether the release uses an external help server at all. */
  external: boolean;
  ours: boolean;
}

/** F1 in each Houdini release on the machine. */
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
    <Section title="F1 in Houdini" detail="Which Houdini releases open their help here when you press F1.">
      {releases?.length === 0 && <p className="text-meta text-neutral-500">No Houdini preferences found on this machine.</p>}
      {releases?.map((one) => (
        <SettingRow
          key={one.release}
          label={`Houdini ${one.release}`}
          detail={
            !one.external || !one.url ? "Opens Houdini's own help" : one.ours ? "Opens HoudiniMD" : `Opens ${one.url}`
          }
          checked={one.external && one.ours}
          onChange={(next) => void flip(one.release, next)}
        />
      ))}
    </Section>
  );
}

interface Agent {
  key: string;
  label: string;
}

/** Written by `install_houdini_mcp` when the installer succeeds. */
const MCP_INSTALLED = "mcp_installed";

/**
 * Houdini MCP, for a reader whose agent arrived after the setup, or who said
 * no then. It only claims what the app knows: the installer ran for an agent
 * and said it worked. Nothing reads the agent's own config back.
 */
function McpSection() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [record, setRecord] = useState<{ agent: string; at: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = useCallback(() => {
    setAgents(null);
    void invoke<Agent[]>("mcp_agents")
      .catch(() => [])
      .then((found) => {
        setAgents(found);
        setChosen((current) => (found.some((one) => one.key === current) ? current : (found[0]?.key ?? "")));
      });
  }, []);
  const readRecord = useCallback(() => {
    void invoke<string | null>("get_setting", { key: MCP_INSTALLED })
      .then((value) => {
        const parsed = value ? (JSON.parse(value) as { agent: string; at: number }) : null;
        setRecord(parsed);
        if (parsed) setChosen((current) => current || parsed.agent);
      })
      .catch(() => setRecord(null));
  }, []);
  useEffect(() => {
    readRecord();
    scan();
  }, [readRecord, scan]);

  const labelOf = (key: string) => agents?.find((one) => one.key === key)?.label ?? key;

  async function install() {
    setBusy(true);
    try {
      await invoke("install_houdini_mcp", { agent: chosen });
      showToast("Houdini MCP is installed. Restart Houdini and your agent.");
      readRecord();
    } catch (reason) {
      showToast(`Houdini MCP did not install: ${String(reason)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  const date = record
    ? new Date(record.at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "";

  return (
    <Section
      title="Houdini MCP"
      detail="Lets an AI agent drive Houdini and read these docs from the local index, so it answers about the Houdini build you have installed."
    >
      <p className="text-meta text-neutral-800">
        {record ? `Installed for ${labelOf(record.agent)} on ${date}.` : "Not installed from this app yet."}
      </p>

      {agents?.length === 0 ? (
        <p className="text-meta text-neutral-500">
          No supported agent found on this machine. Houdini MCP works with Claude, Codex, Gemini CLI, Cursor, opencode
          and pi. Install one, then scan again.
        </p>
      ) : (
        <div className="-mx-ms flex flex-wrap gap-sm">
          {agents === null &&
            [96, 128, 88].map((width) => (
              <span
                key={width}
                aria-hidden
                style={{ width }}
                className="h-chip rounded-lg border border-hairline bg-neutral-50"
              />
            ))}
          {agents?.map((one) => (
            <ChoiceRow
              key={one.key}
              compact
              label={one.label}
              chosen={one.key === chosen}
              onClick={() => setChosen(one.key)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-lg">
        <PrimaryButton disabled={busy || !chosen} onClick={() => void install()} className={cn(!chosen && "opacity-50")}>
          {busy ? "Installing…" : record?.agent === chosen ? "Install again" : "Install"}
        </PrimaryButton>
        <button type="button" disabled={agents === null} className={TEXT_BUTTON} onClick={scan}>
          Scan for agents again
        </button>
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
      {on !== null && <SettingRow label="Send anonymous usage data" checked={on} onChange={(next) => void flip(next)} />}
      <button
        type="button"
        className={cn(TEXT_BUTTON, "self-start")}
        onClick={() => void invoke("show_telemetry_log").catch((reason) => showToast(String(reason), "error"))}
      >
        See what is sent
      </button>
    </Section>
  );
}
