// THROWAWAY PROTOTYPE — the graph's node components, shared by all variants.
// Structure and animation classes are the shipped cockpit's; the *material* of
// each card (shadow, glass, flat graphite) comes from the enclosing `.theme-*`
// scope in index.css, so the canvas reads native inside every chrome.
import { Handle, Position, ViewportPortal, useNodes, type NodeProps } from "@xyflow/react";
import { Target, Waves, type Icon } from "@phosphor-icons/react";
import { stateOf, type MapSnapshot, type Ticket, type TicketState } from "@/lib/domain";
import { stateStyle, typeIcon } from "@/lib/tokens";
import { DrawnEdge } from "@/components/DrawnEdge";
import { NODE_W } from "@/lib/graph";
import { cn } from "@/lib/utils";

export const visualState = (t: Ticket, snap: MapSnapshot): TicketState | "invalid" =>
  t.malformed ? "invalid" : stateOf(t, snap);

/** Set by useSnapshotDiff on whatever has just arrived, left, or morphed. */
type Lifecycle = { enterDelay?: number; exiting?: boolean; morph?: boolean };

const lifecycle = (data: Lifecycle) => ({
  className: data.exiting ? "node-exiting" : data.morph ? "node-morph" : undefined,
  style: { ["--enter-delay" as string]: `${data.enterDelay ?? 0}ms` },
});

type TicketNodeData = Lifecycle & { ticket: Ticket; snap: MapSnapshot };

const TicketNode = ({ data, selected }: NodeProps & { data: TicketNodeData }) => {
  const { ticket, snap } = data;
  const s = stateStyle[visualState(ticket, snap)];
  const TypeIcon: Icon = typeIcon[ticket.type];
  const life = lifecycle(data);

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div
        className={cn(
          "node-card ticket-material relative flex items-start gap-2.5 overflow-hidden py-2.5 pl-3.5 pr-3",
          "rounded-[var(--r-surface)] border",
          s.border,
          visualState(ticket, snap) === "blocked" && "opacity-65",
          selected && "ring-1 ring-ink/45",
          life.className,
        )}
        style={{ width: NODE_W, ...life.style }}
      >
        {/* state as a spine, not as a badge: readable at any zoom */}
        <span className={cn("absolute inset-y-0 left-0 w-[2px]", s.dot)} />
        <TypeIcon size={15} className="mt-[3px] shrink-0 text-ink-faint" weight="regular" />
        <span className="min-w-0 flex-1">
          <span className="t-title block truncate text-[12.5px] font-medium text-ink">
            {ticket.title}
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span className="t-mono text-[10px] text-ink-faint">{ticket.shortId}</span>
            <span className="size-[3px] rounded-full bg-hair-bright" />
            <span className={cn("text-[10px]", s.text)}>{s.label}</span>
            {ticket.assignee && ticket.status === "open" ? (
              <span className="truncate text-[10px] text-ink-faint">{ticket.assignee}</span>
            ) : null}
          </span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
};

const FogNode = ({ data }: NodeProps & { data: Lifecycle & { term: string } }) => (
  <>
    <Handle type="target" position={Position.Left} />
    <div
      className={cn(
        "node-card flex items-center gap-2 rounded-[var(--r-surface)] border border-dashed border-hair-bright/60 bg-transparent px-3 py-2.5",
        lifecycle(data).className,
      )}
      style={{ width: NODE_W - 24, ...lifecycle(data).style }}
    >
      <Waves size={14} className="shrink-0 text-ink-faint" />
      <span className="t-title truncate text-[12px] italic text-ink-dim">{data.term}</span>
    </div>
    <Handle type="source" position={Position.Right} />
  </>
);

const DestinationNode = ({
  data,
}: NodeProps & { data: Lifecycle & { reached: number; total: number } }) => (
  <>
    <Handle type="target" position={Position.Left} />
    <div
      className="node-card flex w-[104px] flex-col items-center gap-2 rounded-[var(--r-surface)] border border-destination/35 bg-destination/[0.07] px-3 py-4"
      style={lifecycle(data).style}
    >
      <Target size={22} className="text-destination" weight="regular" />
      <span className="t-label !text-[10px] text-destination">destination</span>
      <span className="t-mono text-[11px] text-ink-faint">
        {data.reached}/{data.total}
      </span>
    </div>
  </>
);

export const nodeTypes = {
  ticket: TicketNode as never,
  fog: FogNode as never,
  destination: DestinationNode as never,
};

export const edgeTypes = { drawn: DrawnEdge as never };

/**
 * The fog veil — the only perpetual animation, in graph coordinates so it pans
 * with the map. Gradient colours come from the theme (--fog-1/--fog-2).
 */
export const FogVeil = () => {
  const fog = useNodes().filter((n) => n.type === "fog" && !n.data["exiting"]);
  if (!fog.length) return null;
  const left = Math.min(...fog.map((n) => n.position.x)) - 72;
  const top = Math.min(...fog.map((n) => n.position.y)) - 96;
  const right = Math.max(...fog.map((n) => n.position.x + (n.width ?? NODE_W))) + 200;
  const bottom = Math.max(...fog.map((n) => n.position.y + (n.height ?? 46))) + 96;
  return (
    <ViewportPortal>
      <div
        className="pointer-events-none"
        style={{ position: "absolute", left, top, width: right - left, height: bottom - top }}
      >
        <div className="fog-veil absolute inset-0 bg-[radial-gradient(ellipse_at_40%_50%,var(--fog-1),transparent_70%)] blur-2xl" />
        <div className="fog-veil-2 absolute inset-x-16 inset-y-6 bg-[radial-gradient(ellipse_at_65%_45%,var(--fog-2),transparent_65%)] blur-3xl" />
      </div>
    </ViewportPortal>
  );
};
