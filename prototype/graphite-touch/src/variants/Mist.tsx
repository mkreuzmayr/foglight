// THROWAWAY PROTOTYPE — Tone D: "Mist".
// Atmospheric: the thinnest glass, hairlines nearly gone, the fog a step more present.
import type { MapSnapshot } from "@/lib/domain";
import { GlassShell } from "@/canvas/GlassShell";
import { HarborRail } from "@/canvas/HarborRail";

export const Mist = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell
    snap={snap}
    themeClass="theme-graphite tone-mist"
    renderRail={(ctx) => <HarborRail {...ctx} />}
  />
);
