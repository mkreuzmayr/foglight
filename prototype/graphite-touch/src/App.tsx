// THROWAWAY PROTOTYPE — tone variations on the settled Graphite cockpit,
// switchable via `?variant=A|B|C|D`. Concept, layout, palette and colour
// discipline are all fixed now; what varies is touch — radii, glass weight,
// contrast, shadow depth. A is the untouched round-three winner.
import { useEffect, useState } from "react";
import { PrototypeSwitcher, type VariantKey } from "@/components/PrototypeSwitcher";
import { advanceFrontier, snapshot } from "@/lib/fixture";
import { Baseline } from "@/variants/Baseline";
import { Soft } from "@/variants/Soft";
import { Crisp } from "@/variants/Crisp";
import { Mist } from "@/variants/Mist";
import type { MapSnapshot } from "@/lib/domain";

const readVariant = (): VariantKey => {
  const v = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return v === "B" || v === "C" || v === "D" ? v : "A";
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
      {variant === "A" ? <Baseline snap={snap} /> : null}
      {variant === "B" ? <Soft snap={snap} /> : null}
      {variant === "C" ? <Crisp snap={snap} /> : null}
      {variant === "D" ? <Mist snap={snap} /> : null}
      <PrototypeSwitcher
        current={variant}
        onChange={setVariant}
        right={
          <button
            onClick={() => setSnap(live ? snapshot : advanceFrontier(snapshot))}
            className="rounded-full bg-black px-2.5 py-1 text-[11px] font-medium text-white"
            title="Simulates a change signal: 006 closes, 007 unblocks, a fog patch graduates. The canvas animations must read the same in every treatment."
          >
            {live ? "reset map" : "simulate change ⟳"}
          </button>
        }
      />
    </div>
  );
};
