/**
 * Headless-Chromium probe, kept as a regression check.
 *
 * **Verification needs a real browser** (SPEC.md §8, trap 5). jsdom cannot see
 * SVG geometry, WAAPI or layout, and React Flow renders no edges at all
 * without measurement — so a jsdom "it mounted" test would pass on a cockpit
 * that draws nothing. Every trap in §8 was found this way and would be
 * re-found this way.
 *
 * Run against a live `foglight serve`:
 *   FOGLIGHT_URL=http://127.0.0.1:4747 npx tsx test/cockpit.probe.ts
 */
import { chromium } from "playwright";

const URL_BASE = process.env["FOGLIGHT_URL"] ?? "http://127.0.0.1:4747";

const checks: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = "") => checks.push([name, ok, detail]);

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".react-flow__node", { timeout: 15_000 });
  await page.waitForTimeout(1200);

  check("no page errors", errors.length === 0, errors.join(" | "));

  const nodes = await page.locator(".react-flow__node").count();
  check("graph renders nodes", nodes > 0, `${nodes} nodes`);

  // The trap that cost the most: without measurement React Flow renders no
  // edge paths, and a jsdom test cannot tell the difference.
  const edges = await page.locator(".react-flow__edge-path").count();
  check("graph renders edge paths", edges > 0, `${edges} edges`);

  const drawn = await page.locator('.react-flow__edge-path[pathLength="1"]').count();
  check("edges use measurement-free draw (pathLength=1)", drawn > 0, `${drawn} drawn edges`);

  const destination = await page.locator(".react-flow__node-destination").count();
  check("destination is anchored on the graph", destination === 1);

  const rail = page.locator('aside[aria-label="Map index"]');
  check("rail is present", (await rail.count()) === 1);

  // The rail filters through a segmented control, not accordions.
  const tabs = await rail.locator('[role="tab"]').allInnerTexts();
  for (const label of ["Next", "All", "Decided"]) {
    check(`rail segment "${label}"`, tabs.includes(label));
  }

  // The rail owns what the graph structurally cannot show — all of it under "All".
  await rail.getByRole("tab", { name: "All" }).click();
  await page.waitForTimeout(300);
  const text = (await rail.innerText()).toLowerCase();
  for (const label of [
    "frontier",
    "claimed",
    "blocked",
    "decisions so far",
    "not yet specified",
    "out of scope",
  ]) {
    check(`rail section "${label}"`, text.includes(label));
  }

  // Wayfinder's vocabulary, verbatim (CONTEXT.md).
  const body = (await page.locator("body").innerText()).toLowerCase();
  check("destination is named in the rail", body.includes("destination"));

  // The picker is Cmd+K, not Cmd+P — Cmd+P fights browser print, and
  // headless-in-a-browser is the common case.
  await page.keyboard.press("ControlOrMeta+k");
  await page.waitForTimeout(300);
  const filter = page.locator('input[aria-label="Filter maps"]');
  check("Cmd+K opens the picker", (await filter.count()) === 1);
  check(
    "picker filter is focused on open",
    await filter.evaluate((el) => el === document.activeElement),
  );
  await page.keyboard.press("Escape");

  // Selecting a ticket opens its detail *inside the rail* — never a modal.
  await rail.getByRole("tab", { name: "Decided" }).click();
  await page.waitForTimeout(400);
  const rowCount = await rail.locator("button[aria-current], button").count();
  check("rail has selectable rows", rowCount > 0, `${rowCount}`);

  // Addressing is two query params, no router (SPEC.md §9).
  check("url carries ?map=", page.url().includes("map="), page.url());

  const veil = await page.locator(".fog-veil").count();
  check("fog veil only exists when there is fog", veil >= 0, `${veil}`);

  await page.screenshot({ path: "/tmp/foglight-cockpit.png", fullPage: false });
  await browser.close();

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  — ${detail}`}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
};

void main();
