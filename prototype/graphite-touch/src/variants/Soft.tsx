// THROWAWAY PROTOTYPE — Tone B: "Soft".
// Plush: rounder corners, gentler hairlines, deeper but fuzzier shadows, ink eased a step.
import type { MapSnapshot } from "@/lib/domain";
import { GlassShell } from "@/canvas/GlassShell";
import { HarborRail } from "@/canvas/HarborRail";

export const Soft = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell
    snap={snap}
    themeClass="theme-graphite tone-soft"
    renderRail={(ctx) => <HarborRail {...ctx} />}
  />
);
