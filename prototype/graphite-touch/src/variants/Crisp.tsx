// THROWAWAY PROTOTYPE — Tone C: "Crisp".
// Machined: tighter corners, brighter hairlines and ink, thinner glass, short definite shadows.
import type { MapSnapshot } from "@/lib/domain";
import { GlassShell } from "@/canvas/GlassShell";
import { HarborRail } from "@/canvas/HarborRail";

export const Crisp = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell
    snap={snap}
    themeClass="theme-graphite tone-crisp"
    renderRail={(ctx) => <HarborRail {...ctx} />}
  />
);
