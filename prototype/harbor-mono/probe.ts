// THROWAWAY — real-Chromium probe: screenshots every variant, checks the
// directional fitView padding in Nightfall (no node may start under the glass
// rail), and verifies the canvas animations survived the restyle (nodes glide
// on the change signal, edges draw). Run with the dev server up: pnpm tsx probe.ts
import { chromium } from "playwright";

const BASE = "https://cachyharness.tail71b0eb.ts.net:5204";
const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  ignoreHTTPSErrors: true,
});

for (const v of ["A", "B", "C"] as const) {
  await page.goto(`${BASE}/?variant=${v}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `shots/variant-${v}.png` });

  // change signal: capture mid-flight and settled
  await page.getByRole("button", { name: /simulate change/ }).click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: `shots/variant-${v}-mid.png` });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots/variant-${v}-after.png` });
  console.log(`variant ${v}: shots taken`);
}

// Every riff floats its rail: no node may start under it.
await page.goto(`${BASE}/?variant=B`, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
const overlap = await page.evaluate(() => {
  const rail = document.querySelector("aside")!.getBoundingClientRect();
  return [...document.querySelectorAll(".react-flow__node")].filter((n) => {
    const r = n.getBoundingClientRect();
    return r.left < rail.right && r.right > rail.left;
  }).length;
});
console.log(`variant B nodes overlapping rail after fit: ${overlap}`);

// Do nodes actually glide on the change signal? (variant B)
type Positions = Record<string, [number, number] | null>;
const grab = (): Promise<Positions> =>
  page.evaluate(
    'Object.fromEntries([...document.querySelectorAll(".react-flow__node")].map((el) => {' +
      "const m = /translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/.exec(el.style.transform);" +
      'return [el.getAttribute("data-id"), m ? [Math.round(+m[1]), Math.round(+m[2])] : null];' +
      "}))",
  );
const before = await grab();
await page.getByRole("button", { name: /simulate change/ }).click();
await page.waitForTimeout(160);
const mid = await grab();
await page.waitForTimeout(700);
const after = await grab();
let travelled = 0;
let gliding = 0;
for (const id of Object.keys(after)) {
  const b = before[id];
  const m = mid[id];
  const a = after[id];
  if (!b || !a) continue;
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (d > 1) {
    travelled++;
    if (m && Math.hypot(m[0] - b[0], m[1] - b[1]) > 1 && Math.hypot(a[0] - m[0], a[1] - m[1]) > 1)
      gliding++;
  }
}
console.log(`change signal: ${travelled} nodes travelled, ${gliding} seen mid-glide`);

await browser.close();
console.log("done");
