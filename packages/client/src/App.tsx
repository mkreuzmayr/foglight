/**
 * The shell: which map is open, and what to show when none is.
 *
 * Cold start follows SPEC.md §9 exactly — an explicit `?map` always beats the
 * remembered map, one map opens itself, several open the picker over an empty
 * cockpit, and none is an empty state that says where a map should live.
 *
 * Every fatal tracker error gets its **own named state** here rather than a
 * generic failure screen: knowing that a map is unparseable, versus that the
 * tracker is unauthenticated, is most of the diagnosis.
 */
import { Lighthouse, Target, Warning } from "@phosphor-icons/react";
import type { MapDescriptor, ResourceId } from "@foglight/core/domain";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo } from "react";
import { Cockpit } from "@/components/Cockpit";
import { mapsQuery, snapshotQuery } from "@/lib/api.js";
import { rememberedMap, resolveInitialMap, useAddress } from "@/lib/address.js";
import { usePrefetchBodies } from "@/lib/bodies.js";
import { newerOf, useLive } from "@/lib/live.js";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 bg-ground px-8 text-center">
    {children}
  </div>
);

const errorTag = (error: unknown): string => {
  const failure = (error as { failure?: { _tag?: string } } | null)?.failure;
  return failure?._tag ?? (error as { _tag?: string } | null)?._tag ?? "Unknown";
};

const FatalState = ({ error, mapId }: { error: unknown; mapId: ResourceId | null }) => {
  const tag = errorTag(error);
  const copy: Record<string, { title: string; detail: string }> = {
    MapNotFound: {
      title: "That map isn't there",
      detail: `Nothing on this repo's tracker answers to ${mapId ?? "that id"}. It may have been renamed or closed.`,
    },
    MapUnparseable: {
      title: "This map can't be read",
      detail:
        "Foglight found the map but could not make sense of its structure. A map needs a `## Destination` section.",
    },
    TrackerUnauthenticated: {
      title: "No credential for this tracker",
      detail:
        "Set GITHUB_TOKEN or GH_TOKEN in the environment, or run `gh auth login`. Foglight only ever reads.",
    },
    TrackerUnreachable: {
      title: "Can't reach the tracker",
      detail:
        "The tracker didn't answer. Foglight keeps the last snapshot it received and will retry.",
    },
    NoTrackerDetected: {
      title: "No tracker here",
      detail:
        "This repo has no `.wayfinder/` directory and no GitHub `origin` remote. Pass --tracker to force one.",
    },
  };
  const { title, detail } = copy[tag] ?? {
    title: "Something went wrong",
    detail: String(error),
  };

  return (
    <Shell>
      <Warning size={26} className="text-invalid" />
      <h1 className="t-title text-[15px] font-semibold text-ink">{title}</h1>
      <p className="max-w-md text-[12px] leading-relaxed text-ink-dim">{detail}</p>
      <span className="t-mono text-[10px] text-ink-faint">{tag}</span>
    </Shell>
  );
};

const EmptyState = () => (
  <Shell>
    <Lighthouse size={26} className="text-accent" />
    <h1 className="t-title text-[15px] font-semibold text-ink">No maps here yet</h1>
    <p className="max-w-md text-[12px] leading-relaxed text-ink-dim">
      A wayfinder map lives at <span className="t-mono">.wayfinder/map.md</span>, or as an issue
      labelled <span className="t-mono">wayfinder:map</span> on this repo's GitHub. Chart one with{" "}
      <span className="t-mono">/wayfinder</span>, and it will appear here.
    </p>
  </Shell>
);

const PickerOnly = ({
  maps,
  onOpenMap,
}: {
  maps: ReadonlyArray<MapDescriptor>;
  onOpenMap: (id: ResourceId) => void;
}) => (
  <Shell>
    <Target size={26} className="text-destination" />
    <h1 className="t-title text-[15px] font-semibold text-ink">Which map?</h1>
    <ul className="mt-2 w-full max-w-md overflow-hidden rounded-[var(--r-surface)] border border-hair">
      {maps.map((map) => (
        <li key={map.id} className="border-b border-hair/70 last:border-b-0">
          <button
            type="button"
            onPointerDown={() => onOpenMap(map.id)}
            className="flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left hover:bg-panel-2"
          >
            <span className="t-title text-[12.5px] text-ink">{map.title}</span>
            <span className="line-clamp-2 text-[10.5px] leading-snug text-ink-faint">
              {map.destination}
            </span>
            <span className="t-mono mt-1 text-[10px] text-ink-faint">
              {map.closedCount}/{map.closedCount + map.openCount} decided
            </span>
          </button>
        </li>
      ))}
    </ul>
  </Shell>
);

export const App = () => {
  const { address, selectTicket, openMap } = useAddress();
  const maps = useQuery(mapsQuery());

  // Ordered most-recently-changed first, ties alphabetical (SPEC.md §9).
  const choices = useMemo(() => {
    const list = [...(maps.data ?? [])];
    list.sort((a, b) =>
      a.changedAt === b.changedAt
        ? a.title.localeCompare(b.title)
        : b.changedAt.localeCompare(a.changedAt),
    );
    return list;
  }, [maps.data]);

  const openId = useMemo(
    () => resolveInitialMap(address.map, rememberedMap(), choices),
    [address.map, choices],
  );

  // Subscribe *first*, then GET — so a change landing between the two is
  // delivered rather than lost.
  const live = useLive(openId);
  const snapshotFromGet = useQuery({
    ...snapshotQuery(openId as ResourceId),
    enabled: openId !== null,
  });
  const snapshot = newerOf(snapshotFromGet.data ?? null, live.snapshot);

  usePrefetchBodies(snapshot);

  // Keep the URL honest once a map has actually been resolved, so the address
  // bar can always be copied and pasted.
  useEffect(() => {
    if (openId !== null && address.map === null) {
      window.history.replaceState(null, "", `/?map=${encodeURIComponent(openId)}`);
    }
  }, [openId, address.map]);

  const reduce = useReducedMotion();

  if (maps.isPending) {
    return (
      <Shell>
        <span className="text-[12px] text-ink-faint">Reading the tracker…</span>
      </Shell>
    );
  }
  if (maps.isError) return <FatalState error={maps.error} mapId={null} />;
  if (choices.length === 0) return <EmptyState />;
  if (openId === null) return <PickerOnly maps={choices} onOpenMap={openMap} />;
  if (snapshotFromGet.isError && snapshot === null) {
    return <FatalState error={snapshotFromGet.error} mapId={openId} />;
  }
  if (snapshot === null) {
    return (
      <Shell>
        <span className="text-[12px] text-ink-faint">Loading the map…</span>
      </Shell>
    );
  }

  return (
    // Switching maps **cross-fades, never glides**: a different map is a
    // different subject, not a change to this one (SPEC.md §9).
    <AnimatePresence mode="wait">
      <motion.div
        key={String(snapshot.id)}
        className="h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.18 }}
      >
        <Cockpit
          snapshot={snapshot}
          maps={choices}
          connection={live.connection}
          stale={live.stale}
          onRetry={live.retryNow}
          selected={address.ticket}
          onSelect={selectTicket}
          onOpenMap={openMap}
        />
      </motion.div>
    </AnimatePresence>
  );
};
