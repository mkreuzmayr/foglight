// THROWAWAY — watches the exiting fog-edge ghosts specifically.
import { chromium } from "playwright";

const URL = "https://cachyharness.tail71b0eb.ts.net:5199/?variant=D";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /simulate change/ }).click();

for (const t of [40, 120, 250, 400]) {
  await page.waitForTimeout(t === 40 ? 40 : t - [40, 120, 250][[120, 250, 400].indexOf(t)]);
  const state = await page.evaluate(`
    [...document.querySelectorAll(".react-flow__edge-path")]
      .filter((el) => el.id.includes("fog/cli-surface"))
      .map((el) => el.id + " cls=[" + (el.getAttribute("class") || "") + "] anims=" +
        el.getAnimations().map((a) => (a.animationName || "?") + ":" + a.playState).join("|") +
        " opacity=" + getComputedStyle(el).opacity)
  `);
  console.log(`+${t}ms:`, state);
}
await browser.close();
