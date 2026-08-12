/**
 * The rail header: identity, the map picker, and connection state.
 *
 * **Connection state lives here** and nowhere else (SPEC.md §8) — never a
 * modal, never an overlay. The map stays fully interactive on its last
 * snapshot, marked stale; a dropped connection is information, not an
 * interruption.
 */
import { Lighthouse, MagnifyingGlass, Target } from "@phosphor-icons/react";
import type { MapSnapshot, ResourceId } from "@foglight/core/domain";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/live.js";

export type MapChoice = { id: ResourceId; title: string; destination: string };

const CONNECTION: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  connecting: { label: "connecting", dot: "bg-ink-faint", text: "text-ink-faint" },
  live: { label: "live", dot: "bg-decided", text: "text-decided" },
  reconnecting: { label: "reconnecting", dot: "bg-destination", text: "text-destination" },
  offline: { label: "offline", dot: "bg-invalid", text: "text-invalid" },
};

/**
 * The picker (SPEC.md §9): a rail-header popover anchored on the current map's
 * title, on **`Cmd+K`** — not `Cmd+P`, which fights browser print, and
 * headless-in-a-browser is the common case.
 */
const Picker = ({
  maps,
  current,
  onOpenMap,
  onClose,
}: {
  maps: ReadonlyArray<MapChoice>;
  current: ResourceId;
  onOpenMap: (id: ResourceId) => void;
  onClose: () => void;
}) => {
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = filter.trim().toLowerCase();
  const shown = maps.filter(
    (map) =>
      needle === "" ||
      map.title.toLowerCase().includes(needle) ||
      map.destination.toLowerCase().includes(needle),
  );

  return (
    <div className="absolute inset-x-3 top-full z-30 mt-1 overflow-hidden rounded-[var(--r-surface)] border border-hair bg-panel shadow-2xl shadow-black/60">
      {/* Always visible, focused on open — filtering is the primary gesture. */}
      <div className="flex items-center gap-2 border-b border-hair px-3 py-2">
        <MagnifyingGlass size={13} className="shrink-0 text-ink-faint" />
        <input
          ref={inputRef}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter maps"
          aria-label="Filter maps"
          className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <ul className="max-h-72 overflow-y-auto py-1">
        {shown.length === 0 ? (
          <li className="px-3 py-2 text-[11.5px] text-ink-faint">No map matches that.</li>
        ) : (
          shown.map((map) => (
            <li key={map.id}>
              <button
                type="button"
                onPointerDown={() => {
                  onOpenMap(map.id);
                  onClose();
                }}
                aria-current={String(map.id) === String(current) ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-panel-2",
                  String(map.id) === String(current) && "bg-panel-2",
                )}
              >
                <span className="t-title text-[12.5px] text-ink">{map.title}</span>
                <span className="line-clamp-1 text-[10.5px] text-ink-faint">{map.destination}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
};

export const RailHeader = ({
  snapshot,
  maps,
  connection,
  stale,
  onRetry,
  onOpenMap,
}: {
  snapshot: MapSnapshot;
  maps: ReadonlyArray<MapChoice>;
  connection: ConnectionState;
  stale: boolean;
  onRetry: () => void;
  onOpenMap: (id: ResourceId) => void;
}) => {
  const [open, setOpen] = useState(false);
  const state = CONNECTION[connection];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="relative px-4 pb-3 pt-4">
      <div className="flex items-center gap-2">
        <Lighthouse size={16} className="text-accent" weight="regular" />
        <span className="t-title text-[13px] font-semibold tracking-tight">foglight</span>
        {/* The tracker is uniform per repo, so it is named once, here — and
            never as a per-row badge in the picker. */}
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
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Switch map (⌘K)"
        className="t-title mt-3 flex w-full items-center gap-2 rounded-[var(--r-control)] text-left text-[15px] font-semibold hover:text-ink"
      >
        <span className="min-w-0 flex-1 truncate">{snapshot.title}</span>
        <span className="t-mono shrink-0 rounded border border-hair px-1.5 py-0.5 text-[9px] text-ink-faint">
          ⌘K
        </span>
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

      {open ? (
        <Picker
          maps={maps}
          current={snapshot.id}
          onOpenMap={onOpenMap}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </header>
  );
};

export { Target };
