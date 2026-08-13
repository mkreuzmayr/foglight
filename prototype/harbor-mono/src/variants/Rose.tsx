// THROWAWAY PROTOTYPE — Treatment A: "Rose".
// Neutral macOS-dark ground, no tint anywhere in the greys. Colour appears
// only where it means something: the brand pink on interactive accents and
// the frontier state, the semantic state hues, and a whisper of pink in the
// fog. Everything else is grayscale.
import type { MapSnapshot } from "@/lib/domain";
import { GlassShell } from "@/canvas/GlassShell";
import { HarborRail } from "@/canvas/HarborRail";

export const Rose = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell snap={snap} themeClass="theme-rose" renderRail={(ctx) => <HarborRail {...ctx} />} />
);
