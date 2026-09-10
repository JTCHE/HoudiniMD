import { Toggle } from "@/components/ui/Toggle";

/** A choice the step asks for: what it does, what it does it to, and a switch. */
export function SettingRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center gap-md">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] leading-[1.52] font-medium text-neutral-950">
          {label}
        </span>
        {detail && <span className="truncate text-caption text-neutral-400">{detail}</span>}
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
