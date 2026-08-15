/**
 * The rail header: identity, the map picker toggle, and connection state.
 *
 * **Connection state lives here** and nowhere else (SPEC.md §8) — never a
 * modal, never an overlay. The map stays fully interactive on its last
 * snapshot, marked stale; a dropped connection is information, not an
 * interruption.
 *
 * The switcher is K's named control (ticket 004): project name above the map
 * title, one click (or ⌘K) opening the same picker. Padding is G's comfortable
 * air.
 */
import { CaretUpDown, Lighthouse } from "@phosphor-icons/react";
import type { MapSnapshot } from "@foglight/core/domain";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/live.js";

const CONNECTION: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  connecting: { label: "connecting", dot: "bg-ink-faint", text: "text-ink-faint" },
  live: { label: "live", dot: "bg-decided", text: "text-decided" },
  reconnecting: { label: "reconnecting", dot: "bg-destination", text: "text-destination" },
  offline: { label: "offline", dot: "bg-invalid", text: "text-invalid" },
};

export const RailHeader = ({
  snapshot,
  projectName,
  projectPath,
  pickerOpen,
  connection,
  stale,
  onRetry,
  onTogglePicker,
}: {
  snapshot: MapSnapshot;
  projectName: string | null;
  projectPath: string | null;
  pickerOpen: boolean;
  connection: ConnectionState;
  stale: boolean;
  onRetry: () => void;
  onTogglePicker: () => void;
}) => {
  const state = CONNECTION[connection];

  return (
    <header className="relative px-5 pt-5">
      <div className="flex items-center gap-2">
        <Lighthouse size={16} className="text-accent" weight="regular" />
        <span className="t-title text-[13px] font-semibold tracking-tight">foglight</span>
        <span className="t-mono ml-auto truncate text-[10px] text-ink-faint">
          {snapshot.tracker}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", state.dot)} />
          <span className={cn("text-[10px]", state.text)}>{state.label}</span>
        </span>
      </div>

      <button
        type="button"
        onClick={onTogglePicker}
        aria-expanded={pickerOpen}
        aria-haspopup="dialog"
        title={projectPath ?? "Switch map (⌘K)"}
        className="pressable -mx-1 mt-4 flex w-[calc(100%+8px)] items-center gap-2 rounded-[var(--r-control)] px-1 py-1 text-left hover:bg-white/[0.05]"
      >
        <span className="min-w-0 flex-1">
          {projectName ? (
            <span className="t-mono block truncate text-[10px] text-ink-faint">{projectName}</span>
          ) : null}
          <h1 className="t-title mt-1 text-[15px] font-semibold text-ink">{snapshot.title}</h1>
        </span>
        <CaretUpDown size={13} className="shrink-0 text-ink-faint" />
      </button>

      {stale ? (
        <div className="mt-2 flex items-center gap-2 rounded-[var(--r-control)] border border-destination/30 bg-destination/[0.06] px-2.5 py-1.5">
          <span className="text-[10.5px] text-destination">
            Showing the last snapshot foglight received.
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="t-label ml-auto shrink-0 text-destination underline decoration-destination/40"
          >
            retry now
          </button>
        </div>
      ) : null}
    </header>
  );
};
