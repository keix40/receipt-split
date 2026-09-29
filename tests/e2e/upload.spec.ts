import { expect, test } from "@playwright/test";

test("home page links to the scanner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Receipt Split" })).toBeVisible();
  await page.getByRole("link", { name: "Scan a receipt" }).click();
  await expect(page).toHaveURL(/\/upload$/);
});

test("upload page offers a camera-friendly image input", async ({ page }) => {
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Scan a receipt" })).toBeVisible();
  const input = page.locator('input[type="file"]');
  await expect(input).toHaveAttribute("accept", "image/*");
  await expect(input).toHaveAttribute("capture", "environment");
});
