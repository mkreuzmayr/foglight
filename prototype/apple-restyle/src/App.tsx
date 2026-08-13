// THROWAWAY PROTOTYPE — three Apple-language restylings of the foglight
// cockpit, switchable via `?variant=A|B|C`, fed by this repo's own wayfinder
// map. Same rail + canvas structure and the same canvas animations in all
// three; only the design language changes.
import { useEffect, useState } from "react";
import { PrototypeSwitcher, type VariantKey } from "@/components/PrototypeSwitcher";
import { advanceFrontier, snapshot } from "@/lib/fixture";
import { Daylight } from "@/variants/Daylight";
import { Nightfall } from "@/variants/Nightfall";
import { Graphite } from "@/variants/Graphite";
import type { MapSnapshot } from "@/lib/domain";

const readVariant = (): VariantKey => {
  const v = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return v === "B" || v === "C" ? v : "A";
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
      {variant === "A" ? <Daylight snap={snap} /> : null}
      {variant === "B" ? <Nightfall snap={snap} /> : null}
      {variant === "C" ? <Graphite snap={snap} /> : null}
      <PrototypeSwitcher
        current={variant}
        onChange={setVariant}
        right={
          <button
            onClick={() => setSnap(live ? snapshot : advanceFrontier(snapshot))}
            className="rounded-full bg-black px-2.5 py-1 text-[11px] font-medium text-white"
            title="Simulates a change signal: 006 closes, 007 unblocks, a fog patch graduates. Watch the canvas animations — they must survive every restyle."
          >
            {live ? "reset map" : "simulate change ⟳"}
          </button>
        }
      />
    </div>
  );
};
