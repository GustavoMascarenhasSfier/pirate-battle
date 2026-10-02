import { expect, test } from "@playwright/test";
import { boot } from "./helpers";

test("options validate, persist, and can be left", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Options" })).toBeFocused();
  await page.getByRole("button", { name: "Options" }).click();
  await page.getByLabel("Game session time (s)").fill("10");
  await expect(page.getByText("Enter 60–180 seconds")).toBeVisible();
  await page.getByLabel("Enemy spawn time (s)").fill("0");
  await expect(page.getByText("Enter 1–15 seconds")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Game session time (s)")).toBeVisible();
  await page.getByLabel("Game session time (s)").fill("120");
  await page.getByLabel("Enemy spawn time (s)").fill("4.5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.getByLabel("Game session time (s)")).toHaveValue("120");
  await expect(page.getByLabel("Enemy spawn time (s)")).toHaveValue("4.5");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});
