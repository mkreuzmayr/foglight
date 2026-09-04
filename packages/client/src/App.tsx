/**
 * The shell: which map is open, and what to show when none is.
 *
 * Cold start follows SPEC.md §9 and ticket 003: an explicit `?map` always
 * beats the remembered map; a remembered id whose project has detached is
 * kept and waited for; a session with exactly one reachable map and nothing
 * remembered opens it outright. The picker is E's jump pane; live attach and
 * detach arrive on the same SSE connection as everything else.
 */
import { Option, Schema } from "effect";
import { Lighthouse, Warning } from "@phosphor-icons/react";
import type { MapDescriptor, MapSnapshot, Project, ResourceId } from "@foglight/core/domain";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
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

const parseErrorTag = Schema.decodeUnknownOption(
  Schema.Struct({
    _tag: Schema.optional(Schema.String),
    failure: Schema.optional(Schema.Struct({ _tag: Schema.optional(Schema.String) })),
  }),
);

const FatalState = ({ error, mapId }: { error: unknown; mapId: ResourceId | null }) => {
  const parsed = Option.getOrUndefined(parseErrorTag(error));
  const tag = parsed?.failure?._tag ?? parsed?._tag ?? "Unknown";
  const copy = new Map(
    Object.entries({
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
    }),
  );

  const { title, detail } = copy.get(tag) ?? {
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
  projects: readonly Project[];
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
          labelled <span className="t-mono">wayfinder:map</span> on a project&apos;s GitHub. Chart
          one with <span className="t-mono">/wayfinder</span>, then{" "}
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

  const projectList = projectsQueryResult.data ?? [];
  const choices = availableMaps(maps.data, projectList, projectsQueryResult.isSuccess);

  const rememberedId = rememberedMap();
  const openId = resolveInitialMap(address.map, rememberedId, choices);
  const { pickerOpen, setPickerOpen } = usePickerState(openId, maps.isPending, choices.length);

  // Subscribe *first*, then GET — so a change landing between the two is
  // delivered rather than lost.
  const live = useLive(openId);
  const snapshotFromGet = useQuery(snapshotQuery(openId));

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

  const project = describeOpenProject(projectList, snapshot);
  useMapMemory(openId, address.map, snapshot, project.projectName);

  const reduce = useReducedMotion();
  const waiting = rememberedInfo();

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

  if (maps.isError) {
    return <FatalState error={maps.error} mapId={null} />;
  }

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
            projectName={project.projectName}
            projectPath={project.projectPath}
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

const compareMaps = (a: MapDescriptor, b: MapDescriptor) =>
  a.changedAt === b.changedAt
    ? a.title.localeCompare(b.title)
    : b.changedAt.localeCompare(a.changedAt);

const availableMaps = (
  maps: readonly MapDescriptor[] | undefined,
  projects: readonly Project[],
  projectsLoaded: boolean,
) => {
  const attached = new Set(projects.map((project) => project.id));

  return (maps ?? [])
    .filter((map) => !projectsLoaded || map.project === undefined || attached.has(map.project.id))
    .toSorted(compareMaps);
};

const describeOpenProject = (projects: readonly Project[], snapshot: MapSnapshot | null) => {
  const project = projects.find((candidate) => candidate.id === snapshot?.project?.id);
  if (project === undefined) {
    return { projectName: snapshot?.project?.name ?? null, projectPath: null };
  }

  const label = projectLabel(project, collidingNames(projects));

  return { projectName: label.name, projectPath: label.disambiguator ?? project.path };
};

const useMapMemory = (
  openId: ResourceId | null,
  addressMap: ResourceId | null,
  snapshot: MapSnapshot | null,
  projectName: string | null,
) => {
  const title = snapshot?.title;
  // oxlint-disable-next-line mkrz/no-restricted-react-hooks -- Sync resolved server data to browser history and persistent map memory.
  useEffect(() => {
    if (openId === null) {
      return;
    }

    if (addressMap === null) {
      window.history.replaceState(null, "", `/?map=${encodeURIComponent(openId)}`);
    }

    if (title !== undefined) {
      rememberMap(openId, { title, projectName: projectName ?? "" });
    }
  }, [openId, addressMap, title, projectName]);
};

const usePickerState = (openId: ResourceId | null, pending: boolean, choiceCount: number) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previousMap, setPreviousMap] = useState<ResourceId | null | undefined>(undefined);
  if (!pending && previousMap !== openId) {
    setPreviousMap(openId);
    setPickerOpen(openId === null && (previousMap !== undefined || choiceCount > 1));
  }

  // oxlint-disable-next-line mkrz/no-restricted-react-hooks -- Register and clean up the global Cmd/Ctrl-K browser shortcut.
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

  return { pickerOpen, setPickerOpen };
};
