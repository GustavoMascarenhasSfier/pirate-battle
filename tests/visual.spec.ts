import { expect, test } from "@playwright/test";
import { advance, boot, startMatch } from "./helpers";

test("menu", async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId("ranking-table")).toBeVisible();
  await expect(page).toHaveScreenshot("menu.png");
});

test("arena", async ({ page }) => {
  await boot(page, { testClock: true, seed: 1, spawn: 15 });
  await startMatch(page);
  await expect(page.getByTestId("hud-score")).toHaveText("Score 0");
  await expect(page.getByTestId("game")).toHaveScreenshot("arena.png");
});

test("result", async ({ page }) => {
  await boot(page, { testClock: true, seed: 21, session: 60, spawn: 15 });
  await startMatch(page);
  await advance(page, 61);
  await expect(page.getByTestId("result-reason")).toHaveText("Ended by: time");
  await expect(page.getByTestId("result-status")).toContainText("Saved");
  await expect(page).toHaveScreenshot("result.png");
});
