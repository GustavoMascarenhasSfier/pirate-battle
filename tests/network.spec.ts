import { expect, test } from "@playwright/test";
import { configKey, makeConfig } from "../src/game/config";
import { buildFixtures, compareRank } from "../src/api/fixtures";
import { advance, boot, openScenario, startMatch } from "./helpers";

const ladder = buildFixtures()
  .filter((r) => configKey(r.config) === configKey(makeConfig()))
  .sort(compareRank);

test("ranking and history paginate, and cover loading, empty and error", async ({
  page,
}) => {
  await boot(page, { latency: null, scenario: "slow" });
  await expect(
    page.getByRole("status").filter({ hasText: "Loading" }),
  ).toBeVisible();
  await expect(page.getByTestId("ranking-table")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("match-row").first()).toContainText("Anne");
  await expect(page.getByTestId("page-label")).toHaveText("1 / 6");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("page-label")).toHaveText("2 / 6");
  await expect(page.getByTestId("match-row").first()).toContainText(
    ladder[5]!.playerName,
  );
  await page.getByRole("button", { name: "Prev" }).click();
  await expect(page.getByTestId("match-row").nth(0)).toContainText("Anne");
  await expect(page.getByTestId("match-row").nth(1)).toContainText("Bart");

  await page.getByRole("tab", { name: "Match History" }).click();
  await expect(page.getByTestId("history-table")).toBeVisible();
  await expect(page.getByTestId("match-row").first()).toContainText("15");
  await expect(page.getByTestId("match-row").first()).toContainText("death");
  await expect(page.getByTestId("page-label")).toHaveText("1 / 3");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("page-label")).toHaveText("2 / 3");

  await page.getByRole("tab", { name: "Ranking" }).click();
  await openScenario(page, "empty");
  await expect(page.getByText("No matches yet.")).toBeVisible();
  await openScenario(page, "ranking-error");
  await expect(page.getByRole("alert")).toContainText("Could not load ranking");
  await openScenario(page, "ranking-4xx");
  await expect(page.getByRole("alert")).toContainText("Could not load ranking");
  await openScenario(page, "connection-error");
  await expect(page.getByRole("alert")).toContainText("Could not load ranking");
  await page.getByRole("tab", { name: "Match History" }).click();
  await openScenario(page, "history-error");
  await expect(page.getByRole("alert")).toContainText("Could not load history");
  await openScenario(page, "normal");
  await expect(page.getByTestId("history-table")).toBeVisible();
});

test("a slow page does not replace a newer page", async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId("match-row").first()).toContainText("Anne");
  await openScenario(page, "out-of-order");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("page-label")).toHaveText("2 / 6");
  await expect(page.getByTestId("match-row").first()).toContainText(
    ladder[5]!.playerName,
  );
  await page.waitForTimeout(1800);
  await expect(page.getByTestId("page-label")).toHaveText("2 / 6");
  await expect(page.getByTestId("match-row").first()).toContainText(
    ladder[5]!.playerName,
  );
});

test("a finished match updates both tabs and a timed-out save does not duplicate", async ({
  page,
}) => {
  await boot(page, {
    testClock: true,
    seed: 8,
    session: 60,
    spawn: 15,
    scenario: "post-timeout-after-save",
    clientTimeout: 400,
  });
  await startMatch(page);
  await advance(page, 61);
  await expect(page.getByTestId("result-status")).toContainText("Pending", {
    timeout: 20_000,
  });
  const id = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem("last-result") || "{}") as {
          id: string;
        }
      ).id,
  );
  await expect
    .poll(async () =>
      page.evaluate((matchId) => {
        const rows = JSON.parse(localStorage.getItem("mock-db") || "[]") as {
          id: string;
        }[];
        return rows.filter((r) => r.id === matchId).length;
      }, id),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Play Again" }).click();
  await page.waitForFunction(
    () =>
      (window as unknown as { __pirate?: { ready: boolean } }).__pirate
        ?.ready === true,
  );
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Main Menu" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "pending" }),
  ).toBeVisible();
  await openScenario(page, "normal");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "pending" }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate((matchId) => {
        const rows = JSON.parse(localStorage.getItem("mock-db") || "[]") as {
          id: string;
        }[];
        return rows.filter((r) => r.id === matchId).length;
      }, id),
    )
    .toBe(1);

  const score = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem("last-result") || "{}") as {
          score: number;
        }
      ).score,
  );
  await page.getByRole("tab", { name: "Ranking" }).click();
  await expect(page.getByTestId("ranking-table")).toContainText("You");
  await page.getByRole("tab", { name: "Match History" }).click();
  await expect(page.getByTestId("history-table")).toContainText(String(score));
  const copies = await page.evaluate((matchId) => {
    const rows = JSON.parse(localStorage.getItem("mock-db") || "[]") as {
      id: string;
    }[];
    return rows.filter((r) => r.id === matchId).length;
  }, id);
  expect(copies).toBe(1);
});

test("a failed save stays pending across refresh and then saves once", async ({
  page,
}) => {
  await boot(page, {
    testClock: true,
    seed: 6,
    session: 60,
    spawn: 15,
    scenario: "post-down",
  });
  await startMatch(page);
  await page.keyboard.down("w");
  await advance(page, 61);
  await page.keyboard.up("w");
  await expect(page.getByTestId("result-status")).toContainText("Pending");
  const id = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem("last-result") || "{}") as {
          id: string;
        }
      ).id,
  );
  await page.reload();
  await expect(page.getByTestId("result-status")).toContainText("Pending");
  await page.evaluate(() => localStorage.setItem("mock-scenario", "normal"));
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByTestId("result-status")).toHaveText("Record: Saved");
  await page.reload();
  await expect(page.getByTestId("result-status")).toHaveText("Record: Saved");
  const copies = await page.evaluate((matchId) => {
    const rows = JSON.parse(localStorage.getItem("mock-db") || "[]") as {
      id: string;
    }[];
    return rows.filter((r) => r.id === matchId).length;
  }, id);
  expect(copies).toBe(1);
});

test("get timeout surfaces an error, the game still starts, and reset restores fixtures", async ({
  page,
}) => {
  await boot(page, {
    scenario: "get-timeout",
    clientTimeout: 300,
    testClock: true,
    spawn: 15,
  });
  await expect(page.getByRole("alert")).toContainText(
    "Could not load ranking",
    { timeout: 20_000 },
  );
  await startMatch(page);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Main Menu" }).click();
  await openScenario(page, "normal");
  await expect(page.getByTestId("ranking-table")).toBeVisible();
});

test("reset mock state restores the fixtures", async ({ page }) => {
  await boot(page);
  await openScenario(page, "empty");
  await expect(page.getByText("No matches yet.")).toBeVisible();
  await page.getByRole("button", { name: "Reset mock state" }).click();
  await expect(page.locator("#scenario")).toHaveValue("normal");
  await expect(page.getByTestId("match-row").first()).toContainText("Anne");
});
