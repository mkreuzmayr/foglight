// THROWAWAY PROTOTYPE — floating variant switcher. Deliberately ugly-obvious
// so it can't be mistaken for part of the design under evaluation.
import { useEffect } from "react";

export type VariantKey = "A" | "B" | "C";

export const variantNames: Record<VariantKey, string> = {
  A: "Rose (brand pink)",
  B: "Azure (system blue)",
  C: "Graphite (state colour only)",
};

const keys = Object.keys(variantNames) as VariantKey[];

export const PrototypeSwitcher = ({
  current,
  onChange,
  right,
}: {
  current: VariantKey;
  onChange: (v: VariantKey) => void;
  right?: React.ReactNode;
}) => {
  const step = (dir: 1 | -1) => {
    const i = keys.indexOf(current);
    onChange(keys[(i + dir + keys.length) % keys.length]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      )
        return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="pointer-events-auto fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/20 bg-white px-1.5 py-1.5 text-black shadow-2xl shadow-black/60">
      <button
        onClick={() => step(-1)}
        className="grid size-7 place-items-center rounded-full hover:bg-black/10"
        aria-label="previous variant"
      >
        ←
      </button>
      <span className="px-2 text-xs font-semibold tracking-tight tabular-nums">
        {current} · {variantNames[current]}
      </span>
      <button
        onClick={() => step(1)}
        className="grid size-7 place-items-center rounded-full hover:bg-black/10"
        aria-label="next variant"
      >
        →
      </button>
      {right ? (
        <span className="ml-1 flex items-center gap-1 border-l border-black/15 pl-2">{right}</span>
      ) : null}
    </div>
  );
};
