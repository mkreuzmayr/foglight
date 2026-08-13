// THROWAWAY PROTOTYPE — Tone A: "Baseline".
// The Graphite treatment exactly as picked in round three, for side-by-side judgement.
import type { MapSnapshot } from "@/lib/domain";
import { GlassShell } from "@/canvas/GlassShell";
import { HarborRail } from "@/canvas/HarborRail";

export const Baseline = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell
    snap={snap}
    themeClass="theme-graphite"
    renderRail={(ctx) => <HarborRail {...ctx} />}
  />
);
