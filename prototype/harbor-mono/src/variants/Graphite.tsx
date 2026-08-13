// THROWAWAY PROTOTYPE — Treatment C: "Graphite".
// The restraint extreme, like macOS's graphite accent mode: every interactive
// accent (segmented thumb, ring, selection, focus, frontier) is monochrome
// white-on-grey. Colour survives ONLY as semantic state — the muted hues on
// decided / claimed / malformed / destination — and the fog is a neutral
// glow. If colour appears here, it is information.
import type { MapSnapshot } from "@/lib/domain";
import { GlassShell } from "@/canvas/GlassShell";
import { HarborRail } from "@/canvas/HarborRail";

export const Graphite = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell
    snap={snap}
    themeClass="theme-graphite"
    renderRail={(ctx) => <HarborRail {...ctx} />}
  />
);
