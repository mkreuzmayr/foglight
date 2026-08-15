/**
 * The shell: which map is open, and what to show when none is.
 *
 * Cold start follows SPEC.md §9 and ticket 003: an explicit `?map` always
 * beats the remembered map; a remembered id whose project has detached is
 * kept and waited for; a session with exactly one reachable map and nothing
 * remembered opens it outright. The picker is E's jump pane; live attach and
 * detach arrive on the same SSE connection as everything else.
 */
import { Lighthouse, Warning } from "@phosphor-icons/react";
import type { MapDescriptor, Project, ResourceId } from "@foglight/core/domain";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cockpit } from "@/components/Cockpit";
import { MapPicker } from "@/components/MapPicker";
import { mapsQuery, projectsQuery, snapshotQuery } from "@/lib/api.js";
import {
  rememberMap,
  rememberedInfo,
  rememberedMap,
  resolveInitialMap,
  useAddress,
} from "@/lib/address.js";
import { collidingNames, projectLabel } from "@/lib/picker.js";
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

const EmptyState = ({
  projects,
  remembered,
  onBrowse,
}: {
  projects: ReadonlyArray<Project>;
  remembered: { title: string; projectName: string } | null;
  onBrowse: () => void;
}) => {
  const vacant = projects.length === 0 && remembered === null;
  return (
    <Shell>
      <Lighthouse
        size={26}
        className={vacant ? "text-accent" : "text-ink-faint"}
        weight={vacant ? "regular" : "thin"}
      />
      <h1 className="t-title text-[15px] font-semibold text-ink">
        {vacant ? "No maps here yet" : "No map open"}
      </h1>
      {vacant ? (
        <p className="max-w-md text-[12px] leading-relaxed text-ink-dim">
          A wayfinder map lives at <span className="t-mono">.wayfinder/map.md</span>, or as an issue
          labelled <span className="t-mono">wayfinder:map</span> on a project's GitHub. Chart one
          with <span className="t-mono">/wayfinder</span>, then{" "}
          <span className="t-mono">foglight serve</span> in that folder.
        </p>
      ) : (
        <button
          type="button"
          onClick={onBrowse}
          className="pressable mt-1 flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-1.5 text-[12px] text-ink ring-1 ring-white/10 hover:bg-white/[0.1]"
        >
          Browse maps
          <kbd className="t-mono rounded border border-hair-bright px-1 py-px text-[9.5px] text-ink-faint">
            ⌘K
          </kbd>
        </button>
      )}
      {remembered ? (
        <p className="mt-2 max-w-[380px] text-[10.5px] leading-snug text-ink-faint">
          Remembering “{remembered.title}” — it reopens if {remembered.projectName} re-attaches.
        </p>
      ) : null}
    </Shell>
  );
};

export const App = () => {
  const { address, selectTicket, openMap } = useAddress();
  const maps = useQuery(mapsQuery());
  const projectsQueryResult = useQuery(projectsQuery());
  const [pickerOpen, setPickerOpen] = useState(false);

  const projectList = useMemo(() => projectsQueryResult.data ?? [], [projectsQueryResult.data]);
  const attached = useMemo(() => new Set(projectList.map((project) => project.id)), [projectList]);

  // Ordered most-recently-changed first, ties alphabetical (SPEC.md §9). Drop
  // descriptors whose project has already detached — the projects event can
  // beat the maps tick by a beat.
  const choices = useMemo(() => {
    const list = [...(maps.data ?? [])].filter((map) => {
      if (!projectsQueryResult.isSuccess || map.project === undefined) return true;
      return attached.has(map.project.id);
    });
    list.sort((a, b) =>
      a.changedAt === b.changedAt
        ? a.title.localeCompare(b.title)
        : b.changedAt.localeCompare(a.changedAt),
    );
    return list;
  }, [maps.data, attached, projectsQueryResult.isSuccess]);

  const rememberedId = rememberedMap();
  const openId = useMemo(
    () => resolveInitialMap(address.map, rememberedId, choices),
    [address.map, rememberedId, choices],
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

  const pickMap = (id: ResourceId) => {
    const descriptor: MapDescriptor | undefined = choices.find(
      (map) => String(map.id) === String(id),
    );
    const project = projectList.find((p) => p.id === descriptor?.project?.id);
    openMap(
      id,
      descriptor === undefined
        ? undefined
        : { title: descriptor.title, projectName: project?.name ?? descriptor.project?.name ?? "" },
    );
    setPickerOpen(false);
  };

  // Keep the URL honest once a map has actually been resolved, so the address
  // bar can always be copied and pasted.
  useEffect(() => {
    if (openId !== null && address.map === null) {
      window.history.replaceState(null, "", `/?map=${encodeURIComponent(openId)}`);
    }
  }, [openId, address.map]);

  // Refresh the remembered display payload while the map is open, so a later
  // detach can name what it is waiting for.
  useEffect(() => {
    if (openId === null || snapshot === null) return;
    const project = projectList.find((p) => p.id === snapshot.project?.id);
    rememberMap(openId, {
      title: snapshot.title,
      projectName: project?.name ?? snapshot.project?.name ?? "",
    });
  }, [openId, snapshot, projectList]);

  // ⌘K / Ctrl-K anywhere — including the empty state.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPickerOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-open the picker on cold start (several maps) and when the open map's
  // project detaches. Close it when a map reopens itself. Never force it at n=1.
  const prevOpenId = useRef<ResourceId | null | undefined>(undefined);
  useEffect(() => {
    if (maps.isPending) return;
    if (openId !== null) {
      if (prevOpenId.current === null) setPickerOpen(false);
      prevOpenId.current = openId;
      return;
    }
    if (prevOpenId.current) {
      setPickerOpen(true);
      prevOpenId.current = null;
      return;
    }
    if (prevOpenId.current === undefined && choices.length > 1) {
      setPickerOpen(true);
    }
    prevOpenId.current = null;
  }, [openId, maps.isPending, choices.length]);

  const reduce = useReducedMotion();
  const collisions = collidingNames(projectList);
  const openProject = projectList.find((project) => project.id === snapshot?.project?.id);
  const openLabel =
    openProject === undefined
      ? snapshot?.project === undefined
        ? null
        : { name: snapshot.project.name }
      : projectLabel(openProject, collisions);
  const waiting = openId === null ? rememberedInfo() : null;

  const picker = (
    <MapPicker
      open={pickerOpen}
      maps={choices}
      projects={projectList}
      current={openId}
      onOpenMap={pickMap}
      onClose={() => setPickerOpen(false)}
    />
  );

  if (maps.isPending) {
    return (
      <Shell>
        <span className="text-[12px] text-ink-faint">Reading the tracker…</span>
      </Shell>
    );
  }
  if (maps.isError) return <FatalState error={maps.error} mapId={null} />;

  if (openId === null) {
    return (
      <div className="relative h-full">
        <EmptyState
          projects={projectList}
          remembered={waiting}
          onBrowse={() => setPickerOpen(true)}
        />
        {picker}
      </div>
    );
  }

  if (snapshotFromGet.isError && snapshot === null) {
    return <FatalState error={snapshotFromGet.error} mapId={openId} />;
  }
  if (snapshot === null) {
    return (
      <div className="relative h-full">
        <Shell>
          <span className="text-[12px] text-ink-faint">Loading the map…</span>
        </Shell>
        {picker}
      </div>
    );
  }

  return (
    // Switching maps **cross-fades, never glides**: a different map is a
    // different subject, not a change to this one (SPEC.md §9).
    <div className="relative h-full">
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
            projectName={openLabel?.name ?? null}
            projectPath={openLabel?.disambiguator ?? openProject?.path ?? null}
            pickerOpen={pickerOpen}
            connection={live.connection}
            stale={live.stale}
            onRetry={live.retryNow}
            selected={address.ticket}
            onSelect={selectTicket}
            onTogglePicker={() => setPickerOpen((open) => !open)}
          />
        </motion.div>
      </AnimatePresence>
      {picker}
    </div>
  );
};
