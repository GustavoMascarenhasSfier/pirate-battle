import { expect, test } from "@playwright/test";
import { advance, boot, startMatch, state } from "./helpers";

test("assets load with progress and recover after a failure", async ({
  page,
}) => {
  await boot(page, { testClock: true, seed: 1, failAssets: true });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Failed to load assets");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(
    () =>
      (window as unknown as { __pirate?: { ready: boolean } }).__pirate
        ?.ready === true,
  );
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("hud-score")).toContainText("Score 0");
});

test("ship moves, rotates, stays inside the arena and stops on islands", async ({
  page,
}) => {
  await boot(page, { testClock: true, seed: 1, session: 90, spawn: 15 });
  await startMatch(page);
  const start = await state(page);
  const turn = Math.PI / 2 / 2.6;
  await page.keyboard.down("ArrowRight");
  await advance(page, 0.4);
  await page.keyboard.up("ArrowRight");
  const turned = await state(page);
  expect(turned.a).toBeGreaterThan(0.9);
  expect(turned.a).toBeLessThan(1.2);
  await page.keyboard.down("ArrowLeft");
  await advance(page, 0.4);
  await page.keyboard.up("ArrowLeft");

  await page.keyboard.down("w");
  await advance(page, 0.5);
  await page.keyboard.up("w");
  const moved = await state(page);
  expect(moved.y).toBeLessThan(start.y - 70);
  expect(Math.abs(moved.x - start.x)).toBeLessThan(5);

  await page.keyboard.down("w");
  await advance(page, 2);
  await page.keyboard.up("w");
  const blocked = await state(page);
  expect(blocked.y).toBeGreaterThan(490);
  expect(blocked.y).toBeLessThan(start.y - 100);

  await page.keyboard.down("ArrowRight");
  await advance(page, turn * 2);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("w");
  await advance(page, 1);
  await page.keyboard.up("w");
  await page.keyboard.down("ArrowRight");
  await advance(page, turn);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("w");
  await advance(page, 4);
  await page.keyboard.up("w");
  const edge = await state(page);
  expect(edge.x).toBeLessThan(40);
  expect(edge.x).toBeGreaterThanOrEqual(26);
});

test("front and side shots respect cooldown and score a kill once", async ({
  page,
}) => {
  await boot(page, { testClock: true, seed: 3, session: 180, spawn: 15 });
  await startMatch(page);
  await page.keyboard.down(" ");
  await advance(page, 1 / 60);
  const first = (await state(page)).bullets
    .filter((b) => b.fromPlayer)
    .map((b) => b.id);
  expect(first).toHaveLength(1);
  await advance(page, 0.2);
  const held = (await state(page)).bullets
    .filter((b) => b.fromPlayer)
    .map((b) => b.id);
  expect(held.filter((id) => !first.includes(id))).toHaveLength(0);
  await advance(page, 0.4);
  const next = (await state(page)).bullets
    .filter((b) => b.fromPlayer)
    .map((b) => b.id);
  expect(next.some((id) => !first.includes(id))).toBe(true);
  await page.keyboard.up(" ");

  const beforeSide = (await state(page)).bullets.length;
  await page.keyboard.down("e");
  await advance(page, 1 / 60);
  await page.keyboard.up("e");
  const side = (await state(page)).bullets;
  expect(side.length - beforeSide).toBe(3);
  const spread = side
    .slice(-3)
    .map((b) => `${Math.round(b.x)}:${Math.round(b.y)}`);
  expect(new Set(spread).size).toBe(3);

  await advance(page, 15);
  let s = await state(page);
  expect(s.enemies.length).toBeGreaterThan(0);
  const scoreAtSpawn = s.score;
  for (let i = 0; i < 40 && s.score === scoreAtSpawn && !s.ended; i++) {
    const target = s.enemies[0];
    if (!target) break;
    const desired = Math.atan2(target.x - s.x, -(target.y - s.y));
    const diff = Math.atan2(Math.sin(desired - s.a), Math.cos(desired - s.a));
    const key = diff > 0 ? "ArrowRight" : "ArrowLeft";
    await page.keyboard.down(key);
    await advance(page, Math.min(0.45, Math.abs(diff) / 2.6 + 0.02));
    await page.keyboard.up(key);
    await page.keyboard.down(" ");
    await advance(page, 0.4);
    await page.keyboard.up(" ");
    s = await state(page);
  }
  expect(s.score).toBe(scoreAtSpawn + 1);
  const frozen = s.score;
  await page.keyboard.down(" ");
  await advance(page, 0.5);
  await page.keyboard.up(" ");
  expect((await state(page)).score).toBe(frozen);
});

test("chasers and shooters both spawn, and a chaser ram does not score", async ({
  page,
}) => {
  await boot(page, { testClock: true, seed: 2, session: 180, spawn: 1 });
  await startMatch(page);
  await advance(page, 0.9);
  expect((await state(page)).enemies).toHaveLength(0);
  await advance(page, 1.2);
  const kinds = new Set((await state(page)).enemies.map((e) => e.kind));
  expect(kinds.has("shooter")).toBe(true);
  expect(kinds.has("chaser")).toBe(true);

  let s = await state(page);
  for (let i = 0; i < 24 && s && !s.ended; i++) s = await advance(page, 5);
  expect(s?.ended).toBe("death");
  expect(s?.hp).toBe(0);
  expect(s?.score).toBe(0);
  await expect(page.getByTestId("result-reason")).toHaveText("Ended by: death");
  await expect(page.getByTestId("result-score")).toHaveText("Score: 0");
});

test("touch controls move the ship on a coarse pointer", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "mobile",
    "touch layout is for the mobile project",
  );
  await boot(page, { testClock: true, seed: 1, spawn: 15 });
  await startMatch(page);
  const before = await state(page);
  const forward = page.getByRole("button", { name: "Forward" });
  await expect(forward).toBeVisible();
  await forward.dispatchEvent("pointerdown");
  await advance(page, 0.5);
  await forward.dispatchEvent("pointerup");
  expect((await state(page)).y).toBeLessThan(before.y - 70);
});
