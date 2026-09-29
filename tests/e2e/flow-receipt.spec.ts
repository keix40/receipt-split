import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures");
const RECEIPT_PNG = path.join(FIXTURE_DIR, "receipt-e2e.png");

test.beforeAll(async ({ browser }) => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const page = await browser.newPage();
  await page.setContent(`
    <pre style="font: 28px monospace; padding: 24px; background: white; color: black;">
Test Cafe
Burger 12.00
Fries 4.00
Subtotal 16.00
Tax 1.28
Tip 3.00
Total 20.28
    </pre>
  `);
  await page.screenshot({ path: RECEIPT_PNG, type: "png" });
  await page.close();
});

test("full receipt flow: OCR, save, two guests claim, finalize, group balances", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(RECEIPT_PNG);

  await expect(page.getByRole("heading", { name: /Review & save/i })).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: "docs/screenshots/02-review-items.png", fullPage: true });
  await page.getByRole("button", { name: "Save & split" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]+/, { timeout: 30_000 });

  const receiptUrl = page.url();
  const sharePath = new URL(receiptUrl).pathname;

  const guestB = await context.browser()!.newContext();
  const pageB = await guestB.newPage();
  await pageB.goto(receiptUrl);

  await page.getByPlaceholder("Your name").fill("Alex");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("Alex").first()).toBeVisible();

  await pageB.getByPlaceholder("Your name").fill("Sam");
  await pageB.getByRole("button", { name: "Join" }).click();

  await page.getByRole("button", { name: /Burger/i }).click();
  await pageB.getByRole("button", { name: /Fries/i }).click();
  await page.screenshot({ path: "docs/screenshots/03-claim-split.png", fullPage: true });

  await page.getByLabel(/Who paid/i).selectOption({ label: "Alex" });
  await page.getByRole("button", { name: /Lock split/i }).click();
  await expect(page.getByText(/Finalized/i)).toBeVisible();

  await page.getByRole("link", { name: /View group balances/i }).click();
  await expect(page.getByRole("heading", { name: /Test Cafe|Receipt split/i })).toBeVisible();
  await expect(page.getByText(/pays/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-group-balances.png", fullPage: true });

  await guestB.close();

  // Sanity: share link still resolves
  await page.goto(sharePath);
  await expect(page.getByText(/Finalized/i)).toBeVisible();
});
