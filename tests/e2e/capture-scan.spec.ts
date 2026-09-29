import { expect, test } from "@playwright/test";

test("capture scan page screenshot", async ({ page }) => {
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Scan a receipt" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/01-scan.png", fullPage: true });
});
