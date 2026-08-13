// THROWAWAY PROTOTYPE — three colour-discipline treatments of the settled
// Harbor cockpit, switchable via `?variant=A|B|C`. Same flat neutral macOS-dark
// ground in all three (no background tint); what varies is where colour is
// still allowed to appear.
import { useEffect, useState } from "react";
import { PrototypeSwitcher, type VariantKey } from "@/components/PrototypeSwitcher";
import { advanceFrontier, snapshot } from "@/lib/fixture";
import { Rose } from "@/variants/Rose";
import { Azure } from "@/variants/Azure";
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
      {variant === "A" ? <Rose snap={snap} /> : null}
      {variant === "B" ? <Azure snap={snap} /> : null}
      {variant === "C" ? <Graphite snap={snap} /> : null}
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
