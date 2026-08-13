// THROWAWAY PROTOTYPE — riffs on the picked Nightfall cockpit, switchable via
// `?variant=A|B|C|D`. A is the picked baseline for side-by-side judgement; B,
// C, D vary the overall palette and the rail's interior layout. The glass
// shell and every canvas animation are identical in all four.
import { useEffect, useState } from "react";
import { PrototypeSwitcher, type VariantKey } from "@/components/PrototypeSwitcher";
import { advanceFrontier, snapshot } from "@/lib/fixture";
import { Nightfall } from "@/variants/Nightfall";
import { VioletHour } from "@/variants/VioletHour";
import { Harbor } from "@/variants/Harbor";
import { Ember } from "@/variants/Ember";
import type { MapSnapshot } from "@/lib/domain";

const readVariant = (): VariantKey => {
  const v = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return v === "A" || v === "C" || v === "D" ? v : "B";
};

export const App = () => {
  const [variant, setVariant] = useState<VariantKey>(readVariant);
  const [snap, setSnap] = useState<MapSnapshot>(snapshot);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("variant", variant);
    history.replaceState(null, "", url);
  }, [variant]);

  useEffect(() => {
    const onPop = () => setVariant(readVariant());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const live = snap !== snapshot;

  return (
    <div className="h-full">
      {variant === "A" ? <Nightfall snap={snap} /> : null}
      {variant === "B" ? <VioletHour snap={snap} /> : null}
      {variant === "C" ? <Harbor snap={snap} /> : null}
      {variant === "D" ? <Ember snap={snap} /> : null}
      <PrototypeSwitcher
        current={variant}
        onChange={setVariant}
        right={
          <button
            onClick={() => setSnap(live ? snapshot : advanceFrontier(snapshot))}
            className="rounded-full bg-black px-2.5 py-1 text-[11px] font-medium text-white"
            title="Simulates a change signal: 006 closes, 007 unblocks, a fog patch graduates. The canvas animations must read the same in every riff."
          >
            {live ? "reset map" : "simulate change ⟳"}
          </button>
        }
      />
    </div>
  );
};
