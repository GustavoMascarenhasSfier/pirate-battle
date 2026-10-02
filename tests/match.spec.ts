import { expect, test } from "@playwright/test";
import { advance, boot, startMatch, state } from "./helpers";

test("time limit ends the match, freezes it, and play again is a new match", async ({
  page,
}) => {
  await boot(page, { testClock: true, seed: 11, session: 60, spawn: 15 });
  await startMatch(page);
  await advance(page, 61);
  await expect(page.getByRole("region", { name: "Result" })).toBeVisible();
  await expect(page.getByTestId("result-reason")).toHaveText("Ended by: time");
  await page.getByRole("button", { name: "Play Again" }).click();
  await page.waitForFunction(
    () =>
      (window as unknown as { __pirate?: { ready: boolean } }).__pirate
        ?.ready === true,
  );
  const fresh = await state(page);
  expect(fresh.score).toBe(0);
  expect(fresh.hp).toBe(100);
  expect(fresh.time).toBe(0);
  expect(fresh.ended).toBeNull();
  expect(fresh.enemies).toHaveLength(0);
  await advance(page, 61);
  await expect(page.getByTestId("result-reason")).toHaveText("Ended by: time");
});

test("pause, blur and a hidden tab do not advance the clock", async ({
  page,
}) => {
  await boot(page, { testClock: true, seed: 1, spawn: 15 });
  await startMatch(page);
  await advance(page, 2);
  expect((await state(page)).time).toBeGreaterThan(1.5);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Main Menu" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
  const pausedAt = (await state(page)).time;
  await page.keyboard.down("w");
  await page.keyboard.down(" ");
  await advance(page, 3);
  await page.waitForTimeout(400);
  expect((await state(page)).time).toBe(pausedAt);
  expect((await state(page)).paused).toBe(true);
  await page.keyboard.up("w");
  await page.keyboard.up(" ");
  await page.getByRole("button", { name: "Resume" }).click();
  await advance(page, 1);
  const resumed = await state(page);
  expect(resumed.paused).toBe(false);
  expect(resumed.time).toBeGreaterThan(pausedAt + 0.8);
  expect(resumed.time).toBeLessThan(pausedAt + 1.3);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect((await state(page)).paused).toBe(true);
  const atBlur = (await state(page)).time;
  await advance(page, 2);
  expect((await state(page)).time).toBe(atBlur);
  await page.getByRole("button", { name: "Resume" }).click();

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await state(page)).paused).toBe(true);
  const hiddenAt = (await state(page)).time;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await advance(page, 2);
  expect((await state(page)).paused).toBe(true);
  expect((await state(page)).time).toBe(hiddenAt);
});

test("the result survives a refresh and an abandoned match is not recorded", async ({
  page,
}) => {
  await boot(page, { testClock: true, seed: 4, session: 60, spawn: 15 });
  await startMatch(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mock-db"))).toBeNull();

  await startMatch(page);
  await advance(page, 61);
  await expect(page.getByTestId("result-reason")).toHaveText("Ended by: time");
  const score = await page.getByTestId("result-score").innerText();
  await page.reload();
  await expect(page.getByTestId("result-score")).toHaveText(score);
  await expect(page.getByTestId("result-status")).toContainText(
    /Saved|Saving|Pending/,
  );
});

test("leaving a match and moving between screens stays quiet", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await boot(page, { testClock: true, seed: 1, spawn: 15 });
  await page.getByRole("button", { name: "Options" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await startMatch(page);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Main Menu" }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __pirate?: unknown }).__pirate,
    ),
  ).toBeUndefined();
  await startMatch(page);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Main Menu" }).click();
  expect(errors).toEqual([]);
});
