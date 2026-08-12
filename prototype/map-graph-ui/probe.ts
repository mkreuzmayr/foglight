// THROWAWAY — real-browser probe for the change-signal transition.
// Marks every node/edge DOM element before the change, fires it, then checks
// which elements were remounted (marker lost), removed, added, and which
// CSS animations are running mid-transition. Run: pnpm exec tsx probe.ts
import { chromium } from "playwright";

const URL = "https://cachyharness.tail71b0eb.ts.net:5199/?variant=D";

const snapshotDom = () => ({
  nodes: [...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((el) => ({
    id: el.getAttribute("data-id"),
    marked: el.dataset.probe === "1",
    anims: el.getAnimations({ subtree: true }).map((a) => ({
      name: (a as CSSAnimation).animationName ?? a.id,
      state: a.playState,
    })),
  })),
  edges: [...document.querySelectorAll<SVGPathElement>(".react-flow__edge-path")].map((el) => ({
    id: el.id,
    cls: el.getAttribute("class"),
    marked: el.dataset.probe === "1",
    anims: el.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName ?? a.id,
      state: a.playState,
    })),
  })),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && console.log("PAGE ERROR:", m.text()));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500); // let first-paint animations finish

// mark every element so a remount is detectable
await page.evaluate(() => {
  for (const el of document.querySelectorAll<HTMLElement>(
    ".react-flow__node, .react-flow__edge-path",
  ))
    el.dataset.probe = "1";
});

const before = await page.evaluate(snapshotDom);
await page.screenshot({ path: "/tmp/probe-before.png" });

await page.getByRole("button", { name: /simulate change/ }).click();
await page.waitForTimeout(80);
const during = await page.evaluate(snapshotDom);
await page.screenshot({ path: "/tmp/probe-during.png" });

await page.waitForTimeout(900);
const after = await page.evaluate(snapshotDom);
await page.screenshot({ path: "/tmp/probe-after.png" });

type Snap = Awaited<ReturnType<typeof page.evaluate<ReturnType<typeof snapshotDom>>>>;
const report = (label: string, s: Snap) => {
  const remountedNodes = s.nodes.filter((n) => !n.marked).map((n) => n.id);
  const remountedEdges = s.edges.filter((e) => !e.marked).map((e) => e.id);
  const runningAnims = [
    ...s.nodes.flatMap((n) =>
      n.anims.filter((a) => a.state === "running").map((a) => `${n.id}:${a.name}`),
    ),
    ...s.edges.flatMap((e) =>
      e.anims.filter((a) => a.state === "running").map((a) => `${e.id}:${a.name}`),
    ),
  ];
  console.log(`\n=== ${label}: ${s.nodes.length} nodes, ${s.edges.length} edges`);
  console.log(`unmarked (new or remounted) nodes: ${remountedNodes.join(", ") || "none"}`);
  console.log(`unmarked (new or remounted) edges: ${remountedEdges.join(", ") || "none"}`);
  console.log(`running animations: ${runningAnims.join(", ") || "none"}`);
};

report("before", before);
report("during (80ms after click)", during);
report("after (settled)", after);

const beforeIds = new Set(before.nodes.map((n) => n.id));
const afterIds = new Set(after.nodes.map((n) => n.id));
console.log(
  `\nnode diff: gone=[${[...beforeIds].filter((i) => !afterIds.has(i)).join(", ")}] added=[${[...afterIds].filter((i) => !beforeIds.has(i)).join(", ")}]`,
);

await browser.close();

// second pass: MutationObserver timeline of edge/node add/removal around the click
const page2 = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } });
await page2.goto(URL, { waitUntil: "networkidle" });
await page2.waitForTimeout(1500);
await page2.evaluate(`{
  window.__log = [];
  const t0 = performance.now();
  const describe = (n) => {
    if (!(n instanceof Element)) return null;
    if (n.classList && n.classList.contains("react-flow__edge")) return "edge " + n.getAttribute("data-id");
    if (n.classList && n.classList.contains("react-flow__node")) return "node " + n.getAttribute("data-id");
    return null;
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        const d = describe(n);
        if (d) window.__log.push("+" + Math.round(performance.now() - t0) + "ms ADD " + d);
      }
      for (const n of m.removedNodes) {
        const d = describe(n);
        if (d) window.__log.push("+" + Math.round(performance.now() - t0) + "ms DEL " + d);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}`);
await page2.getByRole("button", { name: /simulate change/ }).click();
await page2.waitForTimeout(1200);
const log = await page2.evaluate<string[]>("window.__log");
console.log("\n=== mutation timeline:");
for (const line of log.slice(0, 80)) console.log(line);
process.exit(0);
