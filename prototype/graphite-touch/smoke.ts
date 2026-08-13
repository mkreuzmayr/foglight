// THROWAWAY — mounts each variant in jsdom to catch runtime crashes, since jsdom
// is cheap and honest about crashes (not looks). Run: pnpm smoke
import { createElement } from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", {
  url: "http://localhost:5205/?variant=B",
  pretendToBeVisual: true,
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.location = dom.window.location;
g.history = dom.window.history;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.SVGElement = dom.window.SVGElement;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.DOMMatrixReadOnly = class {
  m22 = 1;
  constructor(_t?: string) {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const errors: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => {
  errors.push(a.map(String).join(" "));
  origError(...a);
};

const { createRoot } = await import("react-dom/client");
const { Baseline } = await import("./src/variants/Baseline");
const { Soft } = await import("./src/variants/Soft");
const { Crisp } = await import("./src/variants/Crisp");
const { Mist } = await import("./src/variants/Mist");
const { snapshot, advanceFrontier } = await import("./src/lib/fixture");

const variants = { A: Baseline, B: Soft, C: Crisp, D: Mist } as const;

for (const [key, V] of Object.entries(variants)) {
  for (const [label, snap] of [
    ["initial", snapshot],
    ["after change signal", advanceFrontier(snapshot)],
  ] as const) {
    const host = dom.window.document.createElement("div");
    dom.window.document.body.append(host);
    const root = createRoot(host);
    root.render(createElement(V, { snap }));
    await new Promise((r) => setTimeout(r, 120));
    const text = host.textContent ?? "";
    const nodeCount = host.querySelectorAll(".react-flow__node").length;
    console.log(
      `variant ${key} (${label}): ${nodeCount} nodes rendered, ${text.length} chars of text`,
    );
    if (nodeCount === 0) throw new Error(`variant ${key} rendered no nodes`);
    root.unmount();
  }
}

// One variant re-rendered on the SAME mount with the changed snapshot, so the
// enter/exit lifecycle (ghost edges, drawn edges, node departure) actually
// runs. jsdom has no SVG geometry or WAAPI, so this proves the React logic.
{
  const host = dom.window.document.createElement("div");
  dom.window.document.body.append(host);
  const root = createRoot(host);
  const count = () => host.querySelectorAll(".react-flow__node").length;

  root.render(createElement(Baseline, { snap: snapshot }));
  await new Promise((r) => setTimeout(r, 150));
  const before = count();

  root.render(createElement(Baseline, { snap: advanceFrontier(snapshot) }));
  await new Promise((r) => setTimeout(r, 60)); // mid-exit: ghosts still present
  const during = count();

  await new Promise((r) => setTimeout(r, 500)); // ghosts dropped
  const after = count();

  console.log(`\ntransition A: before ${before}n → during ${during}n (ghosts) → after ${after}n`);
  // The fog patch morphs into 009 in place, so the node count must hold
  // steady through the transition — a dip means a frame where the map lost
  // an item.
  if (during < after) throw new Error("node count dipped during the transition");
  root.unmount();
}

const real = errors.filter(
  (e) => !e.includes("[React Flow]: Seems like") && !e.includes("not wrapped in act"),
);
if (real.length) {
  console.log(`\n${real.length} console.error(s):`);
  for (const e of real.slice(0, 5)) console.log(" - " + e.slice(0, 300));
  process.exit(1);
}
console.log("\nno runtime errors");
