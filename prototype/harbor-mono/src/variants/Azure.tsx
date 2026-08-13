// THROWAWAY PROTOTYPE — Treatment B: "Azure".
// The same neutral ground with macOS's own dark-mode accent: system blue on
// interactive accents and the frontier state, Apple-dark state hues, a
// whisper of blue in the fog. The "stock macOS app" answer.
import type { MapSnapshot } from "@/lib/domain";
import { GlassShell } from "@/canvas/GlassShell";
import { HarborRail } from "@/canvas/HarborRail";

export const Azure = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell snap={snap} themeClass="theme-azure" renderRail={(ctx) => <HarborRail {...ctx} />} />
);
