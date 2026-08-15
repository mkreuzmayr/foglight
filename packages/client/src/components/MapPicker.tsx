/**
 * The Cmd+K picker: E's jump pane, as settled on ticket 004.
 *
 * A left project pane (All maps selected on open) scopes a right-hand flat
 * list; typing searches globally and collapses the panes. At one project the
 * pane disappears. Degraded projects stay in the pane and explain themselves
 * on the right — they are not footer notes and they do not drop out.
 */
import { MagnifyingGlass, SquaresFour, Warning } from "@phosphor-icons/react";
import type { MapDescriptor, Project, ResourceId } from "@foglight/core/domain";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  collidingNames,
  degradedNote,
  filterMaps,
  isMultiProject,
  mapsOf,
  projectLabel,
} from "@/lib/picker.js";
import { cn } from "@/lib/utils";

const projectDot: Record<Project["state"], string> = {
  ready: "bg-decided",
  "no-tracker": "bg-transparent ring-1 ring-ink-faint",
  error: "bg-invalid",
};

const MiniProgress = ({ closed, total }: { closed: number; total: number }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-[3px] w-9 overflow-hidden rounded-full bg-hair-bright">
      <span
        className={cn("block h-full rounded-full", closed === total ? "bg-decided" : "bg-accent")}
        style={{ width: `${total === 0 ? 0 : (closed / total) * 100}%` }}
      />
    </span>
    <span className="t-mono text-[10px] text-ink-faint">
      {closed}/{total}
    </span>
  </span>
);

const MapRow = ({
  map,
  projectName,
  projectState,
  disambiguator,
  showProject,
  active,
  current,
  onHover,
  onPick,
}: {
  map: MapDescriptor;
  projectName?: string;
  projectState?: Project["state"];
  disambiguator?: string;
  showProject: boolean;
  active: boolean;
  current: boolean;
  onHover: () => void;
  onPick: () => void;
}) => (
  <button
    type="button"
    ref={(el) => {
      if (active) el?.scrollIntoView?.({ block: "nearest" });
    }}
    onPointerMove={onHover}
    onPointerDown={onPick}
    aria-current={current ? "true" : undefined}
    className={cn(
      "flex w-full items-center gap-3 rounded-[var(--r-control)] px-3 py-2 text-left",
      active && "bg-white/[0.07]",
    )}
  >
    <span className="min-w-0 flex-1">
      <span className="t-title block truncate text-[12.5px] text-ink">{map.title}</span>
      <span className="mt-0.5 block truncate text-[10.5px] text-ink-faint">{map.destination}</span>
    </span>
    <MiniProgress closed={map.closedCount} total={map.closedCount + map.openCount} />
    {showProject && projectName ? (
      <span className="flex w-[86px] shrink-0 items-center gap-1.5" title={disambiguator}>
        <span
          className={cn("size-1.5 shrink-0 rounded-full", projectDot[projectState ?? "ready"])}
        />
        <span className="truncate text-[10.5px] text-ink-dim">{projectName}</span>
      </span>
    ) : null}
  </button>
);

const paneEntry = (
  isActive: boolean,
  onClick: () => void,
  left: ReactNode,
  label: string,
  count: number,
  title?: string,
) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cn(
      "flex w-full items-center gap-2 rounded-[var(--r-control)] px-2.5 py-2 text-left",
      isActive && "bg-white/[0.07]",
    )}
  >
    {left}
    <span className="t-title min-w-0 flex-1 truncate text-[12px] text-ink">{label}</span>
    <span className="t-mono shrink-0 text-[9.5px] text-ink-faint">{count}</span>
  </button>
);

export const MapPicker = ({
  open,
  maps,
  projects,
  current,
  onOpenMap,
  onClose,
}: {
  open: boolean;
  maps: ReadonlyArray<MapDescriptor>;
  projects: ReadonlyArray<Project>;
  current: ResourceId | null;
  onOpenMap: (id: ResourceId) => void;
  onClose: () => void;
}) => {
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setScope(null);
    inputRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const multi = isMultiProject(projects);
  const searching = query.trim().length > 0;
  const scoped = scope === null ? undefined : projects.find((project) => project.id === scope);
  const collisions = collidingNames(projects);
  const nav = searching
    ? filterMaps(maps, projects, query)
    : scoped
      ? mapsOf(maps, scoped.id)
      : maps;

  const order: Array<string | null> = [null, ...projects.map((project) => project.id)];
  const moveScope = (dir: 1 | -1) => {
    if (!multi) return;
    const i = order.indexOf(scoped?.id ?? null);
    setScope(order[(i + dir + order.length) % order.length] ?? null);
    setActive(0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      return onClose();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(nav.length === 0 ? 0 : (active + 1) % nav.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(nav.length === 0 ? 0 : (active - 1 + nav.length) % nav.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = nav[active];
      if (chosen !== undefined) onOpenMap(chosen.id);
    }
    if (event.key === "ArrowLeft" && !query && multi) {
      event.preventDefault();
      moveScope(-1);
    }
    if (event.key === "ArrowRight" && !query && multi) {
      event.preventDefault();
      moveScope(1);
    }
  };

  const rows = (showProject: boolean) =>
    nav.map((map, i) => {
      const project = projects.find((p) => p.id === map.project?.id);
      const label = project === undefined ? undefined : projectLabel(project, collisions);
      return (
        <MapRow
          key={String(map.id)}
          map={map}
          projectName={label?.name}
          projectState={project?.state}
          disambiguator={label?.disambiguator ?? project?.path}
          showProject={showProject}
          active={i === active}
          current={current !== null && String(map.id) === String(current)}
          onHover={() => setActive(i)}
          onPick={() => onOpenMap(map.id)}
        />
      );
    });

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="picker"
          className="absolute inset-0 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
        >
          <div className="absolute inset-0 bg-black/45" onPointerDown={onClose} />
          <motion.div
            role="dialog"
            aria-label="Map picker"
            className="material-rail absolute left-1/2 top-[16vh] flex max-h-[62vh] w-[700px] -translate-x-1/2 flex-col overflow-hidden rounded-[18px]"
            style={{ maxWidth: "calc(100vw - 32px)" }}
            initial={reduce ? false : { opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2.5 border-b border-hair px-4 py-3">
              <MagnifyingGlass size={15} className="shrink-0 text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                placeholder="Search every project — or browse below…"
                aria-label="Search maps"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
              />
              <kbd className="t-mono shrink-0 rounded border border-hair-bright px-1.5 py-0.5 text-[9.5px] text-ink-faint">
                esc
              </kbd>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {searching ? (
                <div className="px-1.5 py-1.5">
                  {rows(multi)}
                  {nav.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] text-ink-faint">
                      No map matches “{query}” in any attached project.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[230px]">
                  {multi ? (
                    <div className="w-[190px] shrink-0 border-r border-hair px-1.5 py-1.5">
                      {paneEntry(
                        scoped === undefined,
                        () => {
                          setScope(null);
                          setActive(0);
                        },
                        <SquaresFour size={13} className="shrink-0 text-ink-faint" />,
                        "All maps",
                        maps.length,
                      )}
                      <div className="mx-2.5 my-1 border-t border-hair" />
                      {projects.map((proj) => {
                        const label = projectLabel(proj, collisions);
                        return (
                          <Fragment key={proj.id}>
                            {paneEntry(
                              scoped?.id === proj.id,
                              () => {
                                setScope(proj.id);
                                setActive(0);
                              },
                              <span
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  projectDot[proj.state],
                                )}
                              />,
                              label.name,
                              mapsOf(maps, proj.id).length,
                              label.disambiguator ?? proj.path,
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1 px-1.5 py-1.5">
                    {scoped !== undefined && nav.length === 0 ? (
                      <p className="flex items-start gap-1.5 px-3 py-2.5 text-[11px] leading-snug text-ink-faint">
                        <Warning
                          size={13}
                          className={cn(
                            "mt-[1px] shrink-0",
                            scoped.state === "error" ? "text-invalid" : undefined,
                          )}
                        />
                        {degradedNote(scoped)}
                      </p>
                    ) : null}
                    {rows(multi && scoped === undefined)}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-hair px-4 py-2 text-[10px] text-ink-faint">
              {multi && !searching ? <span>←→ scope</span> : null}
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span className="t-mono ml-auto">
                {maps.length} maps · {projects.length}{" "}
                {projects.length === 1 ? "project" : "projects"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
