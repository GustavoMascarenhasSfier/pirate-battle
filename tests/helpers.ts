import { expect, type Page } from "@playwright/test";

export interface Boot {
  seed?: number;
  testClock?: boolean;
  scenario?: string;
  session?: number;
  spawn?: number;
  /** Pin MSW delay. Omit to use the scenario's own timing. */
  latency?: number | null;
  clientTimeout?: number;
  failAssets?: boolean;
}

export async function boot(page: Page, opts: Boot = {}) {
  const o = { latency: 0 as number | null, ...opts };
  await page.addInitScript((init) => {
    localStorage.setItem("mock-retry-delay", "0");
    if (init.latency != null)
      localStorage.setItem("mock-latency", String(init.latency));
    if (init.scenario) localStorage.setItem("mock-scenario", init.scenario);
    if (init.clientTimeout)
      localStorage.setItem("mock-client-timeout", String(init.clientTimeout));
    if (init.session)
      localStorage.setItem(
        "options",
        JSON.stringify({ sessionSec: init.session, spawnSec: init.spawn ?? 3 }),
      );
  }, o);
  const q = new URLSearchParams();
  if (o.testClock) q.set("testClock", "1");
  if (o.failAssets) q.set("failAssets", "1");
  if (o.seed != null) q.set("seed", String(o.seed));
  await page.goto(`/?${q.toString()}`);
}

export async function startMatch(page: Page) {
  const before = await page.evaluate(
    () =>
      (window as unknown as { __pirate?: { id: number } }).__pirate?.id ?? 0,
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction((prev) => {
    const g = (
      window as unknown as { __pirate?: { ready: boolean; id: number } }
    ).__pirate;
    return !!g && g.ready && g.id !== prev;
  }, before);
  await expect(page.locator("canvas")).toBeVisible();
}

export interface SimState {
  score: number;
  hp: number;
  time: number;
  paused: boolean;
  ended: "time" | "death" | null;
  x: number;
  y: number;
  a: number;
  enemies: { id: number; kind: string; x: number; y: number; hp: number }[];
  bullets: { id: number; fromPlayer: boolean; x: number; y: number }[];
  entities: number;
}

export async function advance(
  page: Page,
  seconds: number,
): Promise<SimState | null> {
  return page.evaluate((s) => {
    const g = (
      window as unknown as {
        __pirate?: { advance: (n: number) => void; state: () => SimState };
      }
    ).__pirate;
    if (!g) return null;
    g.advance(s);
    return g.state();
  }, seconds);
}

export async function state(page: Page): Promise<SimState> {
  return page.evaluate(() =>
    (
      window as unknown as { __pirate: { state: () => SimState } }
    ).__pirate.state(),
  );
}

export async function openScenario(page: Page, name: string) {
  await page.locator("details.dev").evaluate((el: HTMLDetailsElement) => {
    el.open = true;
  });
  await page.locator("#scenario").selectOption(name);
}
