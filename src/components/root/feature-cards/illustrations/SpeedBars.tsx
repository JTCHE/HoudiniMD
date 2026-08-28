/** Load time, drawn to scale: HoudiniMD's bar is a stub next to the source's. */
export function SpeedBars() {
  return (
    <div
      aria-hidden
      className="w-full px-md flex flex-col gap-sm select-none pointer-events-none"
    >
      <div className="flex flex-col gap-xs">
        <p className="flex items-baseline gap-xs text-caption">
          <span className="font-semibold text-foreground">HoudiniMD</span>
          <span className="">0.43s</span>
        </p>
        <div className="h-xs w-1/12 rounded-full bg-neutral-800" />
      </div>
      <div className="flex flex-col gap-xs">
        <p className="flex items-baseline gap-xs text-caption text-muted-foreground">
          <span>SideFX</span>
          <span>4.61s</span>
        </p>
        <div className="h-xs w-full rounded-full bg-neutral-200" />
      </div>
    </div>
  );
}
