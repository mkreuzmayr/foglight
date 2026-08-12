// THROWAWAY PROTOTYPE — three variants of the foglight map view, switchable via
// `?variant=A|B|C`, fed by this repo's own wayfinder map. Wayfinder ticket 005.
import { useEffect, useState } from "react";
import { PrototypeSwitcher, type VariantKey } from "@/components/PrototypeSwitcher";
import { advanceFrontier, snapshot } from "@/lib/fixture";
import { VariantA } from "@/variants/VariantA";
import { VariantB } from "@/variants/VariantB";
import { VariantC } from "@/variants/VariantC";
import { VariantD } from "@/variants/VariantD";
import type { MapSnapshot } from "@/lib/domain";

const readVariant = (): VariantKey => {
  const v = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return v === "A" || v === "B" || v === "C" ? v : "D";
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
      {variant === "D" ? <VariantD snap={snap} /> : null}
      {variant === "A" ? <VariantA snap={snap} /> : null}
      {variant === "B" ? <VariantB snap={snap} /> : null}
      {variant === "C" ? <VariantC snap={snap} /> : null}
      <PrototypeSwitcher
        current={variant}
        onChange={setVariant}
        right={
          <button
            onClick={() => setSnap(live ? snapshot : advanceFrontier(snapshot))}
            className="rounded-full bg-black px-2.5 py-1 text-[11px] font-medium text-white"
            title="Simulates a change signal: 006 closes, 007 unblocks, a fog patch graduates. Watch how much the layout moves."
          >
            {live ? "reset map" : "simulate change ⟳"}
          </button>
        }
      />
    </div>
  );
};
