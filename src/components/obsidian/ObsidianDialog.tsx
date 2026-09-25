/**
 * The question a page with pictures asks before it goes to Obsidian: bring
 * the pictures, which writes into a vault folder, or send the text alone.
 * The answer can be kept; Settings changes it back.
 */
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ChoiceRow } from "@/components/onboarding/ChoiceRow";
import { SettingRow } from "@/components/onboarding/SettingRow";
import { showToast } from "@/components/ui/toast-notification";
import { invoke } from "@/lib/backend";
import {
  OBSIDIAN_PICTURES,
  pickFolder,
  rememberedVault,
  sendText,
  sendWithPictures,
  vaults,
  type Vault,
} from "@/lib/obsidian";

/** The vaults Obsidian lists, as chips, and a chip to pick any other folder. */
export function VaultPicker({ value, onChange }: { value: string | null; onChange: (path: string) => void }) {
  const [known, setKnown] = useState<Vault[] | null>(null);
  useEffect(() => {
    void vaults().then(setKnown);
  }, []);
  const listed = known ?? [];
  // A folder picked by hand is not in Obsidian's list; it still shows.
  const all = value && !listed.some((vault) => vault.path === value)
    ? [{ path: value, name: value.split(/[\\/]/).filter(Boolean).pop() ?? value }, ...listed]
    : listed;
  return (
    <div className="flex flex-wrap gap-sm">
      {all.map((vault) => (
        <ChoiceRow key={vault.path} compact label={vault.name} chosen={vault.path === value} onClick={() => onChange(vault.path)} />
      ))}
      <ChoiceRow
        compact
        label="Other folder…"
        onClick={() => void pickFolder().then((path) => path && onChange(path))}
      />
    </div>
  );
}

export function ObsidianDialog({ title, markdown, onClose }: { title: string; markdown: string; onClose: () => void }) {
  const [bring, setBring] = useState(true);
  const [vault, setVault] = useState<string | null>(null);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);

  // The vault used last time, else the one Obsidian opened last.
  useEffect(() => {
    void rememberedVault().then(async (path) => setVault(path ?? (await vaults())[0]?.path ?? null));
  }, []);

  async function send() {
    setBusy(true);
    try {
      if (keep) await invoke("set_setting", { key: OBSIDIAN_PICTURES, value: bring ? "bring" : "text" });
      if (bring && vault) await sendWithPictures(vault, title, markdown);
      else await sendText(title, markdown);
      showToast("Sent to Obsidian");
      onClose();
    } catch (reason) {
      showToast(String(reason), "error");
      setBusy(false);
    }
  }

  return (
    <Modal label="Send to Obsidian" onClose={onClose} className="w-full max-w-[440px]">
      <div className="flex flex-col gap-lg p-lg">
        <header className="flex flex-col gap-2xs pr-lg">
          <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-neutral-950">Send to Obsidian</h2>
          <p className="text-meta text-neutral-500">This page has pictures. A note sent as text links to them but does not hold them.</p>
        </header>

        <div role="radiogroup" aria-label="Pictures" className="flex flex-col gap-sm">
          <ChoiceRow
            label="Bring the pictures"
            detail="Writes the note and its pictures into your vault folder"
            chosen={bring}
            onClick={() => setBring(true)}
          />
          <ChoiceRow label="Text only" detail="Opens the note in the vault Obsidian has open" chosen={!bring} onClick={() => setBring(false)} />
        </div>

        {bring && (
          <div className="flex flex-col gap-xs">
            <span className="text-caption text-neutral-500">Vault</span>
            <VaultPicker value={vault} onChange={setVault} />
          </div>
        )}

        <SettingRow label="Always do this" detail="Change it in Settings" checked={keep} onChange={setKeep} />

        <div className="flex justify-end">
          <PrimaryButton disabled={busy || (bring && !vault)} onClick={() => void send()}>
            {busy ? "Sending…" : "Send"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
