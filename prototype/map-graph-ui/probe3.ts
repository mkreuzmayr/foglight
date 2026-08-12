// THROWAWAY — verifies the graduation morph: fog/cli-surface must not ghost,
// 009 must appear AT the fog node's position and glide to its rank (and the
// reverse on reset). Run: pnpm exec tsx probe3.ts
import { chromium } from "playwright";

const URL = "https://cachyharness.tail71b0eb.ts.net:5199/?variant=D";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const pos = (id: string) =>
  page.evaluate(
    `(() => {
      const el = document.querySelector('.react-flow__node[data-id="${id}"]');
      if (!el) return null;
      const m = /translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/.exec(el.style.transform);
      const cls = el.querySelector(".node-card")?.getAttribute("class") ?? "";
      return { x: m ? +m[1] : NaN, y: m ? +m[2] : NaN,
               morph: cls.includes("node-morph"), exiting: cls.includes("node-exiting"),
               opacity: getComputedStyle(el.querySelector(".node-card")).opacity };
    })()`,
  ) as Promise<{ x: number; y: number; morph: boolean; exiting: boolean; opacity: string } | null>;

const fogBefore = await pos("fog/cli-surface");
console.log("fog patch before:", fogBefore);

await page.getByRole("button", { name: /simulate change/ }).click();
const samples: string[] = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(55);
  const p9 = await pos("009");
  const fog = await pos("fog/cli-surface");
  samples.push(
    `+${(i + 1) * 55}ms 009=${p9 ? `(${p9.x.toFixed(0)},${p9.y.toFixed(0)}) morph=${p9.morph} op=${p9.opacity}` : "absent"} fog=${fog ? (fog.exiting ? "ghosting" : "present") : "gone"}`,
  );
}
console.log(samples.join("\n"));

const start = samples[0];
const settled = await pos("009");
console.log("\nsettled 009:", settled && `(${settled.x.toFixed(0)},${settled.y.toFixed(0)})`);
console.log(
  "009 started at fog position:",
  fogBefore && start.includes(`(${fogBefore.x.toFixed(0)},`)
    ? "YES"
    : `check manually (fog was ${fogBefore?.x.toFixed(0)},${fogBefore?.y.toFixed(0)})`,
);

// reverse: reset should morph 009 back into the fog patch
await page.getByRole("button", { name: /reset map/ }).click();
await page.waitForTimeout(55);
const fogEarly = await pos("fog/cli-surface");
const nine = await pos("009");
await page.waitForTimeout(600);
const fogSettled = await pos("fog/cli-surface");
console.log(
  `\nreset: fog@55ms=${fogEarly ? `(${fogEarly.x.toFixed(0)},${fogEarly.y.toFixed(0)}) morph=${fogEarly.morph}` : "absent"} 009@55ms=${nine ? (nine.exiting ? "ghosting" : "present") : "gone"} fog settled=(${fogSettled?.x.toFixed(0)},${fogSettled?.y.toFixed(0)})`,
);
console.log(
  "fog re-entered at 009's old position:",
  fogEarly && settled && Math.abs(fogEarly.x - settled.x) < 30 ? "YES" : "NO",
);
await browser.close();
