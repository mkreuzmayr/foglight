// THROWAWAY — which nodes travel on the change signal, and do they glide?
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("https://cachyharness.tail71b0eb.ts.net:5199/?variant=D", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1500);

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
await page.waitForTimeout(180);
const mid = await grab();
await page.waitForTimeout(700);
const after = await grab();

for (const id of Object.keys(after)) {
  const b = before[id];
  const m = mid[id];
  const a = after[id];
  if (!b || !a) continue;
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (d > 1) console.log(`${id}: (${b}) -> mid (${m}) -> (${a})  travelled ${d.toFixed(0)}px`);
}
console.log("done");
await browser.close();
