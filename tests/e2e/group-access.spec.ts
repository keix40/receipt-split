import { expect, test } from "@playwright/test";
import path from "node:path";

const RECEIPT_PNG = path.join(process.cwd(), "tests", "fixtures", "receipt-e2e.png");
const API_ORIGIN = `http://localhost:${process.env.PORT ?? 3000}`;

function sameOriginHeaders() {
  return { origin: API_ORIGIN, "content-type": "application/json" };
}

/** Minimal finalized receipt with one member (Alex) for group access checks. */
async function seedFinalizedReceipt(page: import("@playwright/test").Page) {
  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(RECEIPT_PNG);
  await expect(page.getByRole("heading", { name: /Review & save/i })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Save & split" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]+/, { timeout: 30_000 });

  await page.getByPlaceholder("Your name").fill("Alex");
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByRole("button", { name: /Burger/i }).click();
  await page.getByRole("button", { name: /Fries/i }).click();
  await page.getByLabel(/Who paid/i).selectOption({ label: "Alex" });
  await page.getByRole("button", { name: /Lock split/i }).click();
  await expect(page.getByText(/Finalized/i)).toBeVisible({ timeout: 15_000 });

  const groupHref = await page.getByRole("link", { name: /View group balances/i }).getAttribute("href");
  expect(groupHref).toMatch(/^\/groups\/[0-9a-f-]{36}$/);
  return groupHref!.replace("/groups/", "");
}

test.describe("group access control", () => {
  test("invalid group id returns 404, not 500", async ({ page }) => {
    const res = await page.goto("/groups/not-a-uuid");
    expect(res?.status()).toBe(404);
  });

  test("non-member cannot view or settle; invite link works in fresh browser", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const groupId = await seedFinalizedReceipt(page);

    await page.getByRole("link", { name: /View group balances/i }).click();
    await expect(page.getByText(/Share view-only link/i)).toBeVisible();
    const inviteLink = await page.getByRole("link", { name: /\/groups\// }).first().getAttribute("href");
    expect(inviteLink).toContain("invite=");

    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();

    const blocked = await strangerPage.goto(`/groups/${groupId}`);
    expect(blocked?.status()).toBe(404);

    await strangerPage.goto("/");
    const settleRes = await strangerPage.request.post(`/api/groups/${groupId}/settlements`, {
      headers: sameOriginHeaders(),
      data: {
        fromMemberId: "11111111-1111-4111-8111-111111111111",
        toMemberId: "22222222-2222-4222-8222-222222222222",
        amountCents: 100,
      },
    });
    expect(settleRes.status()).toBe(404);

    const invited = await strangerPage.goto(inviteLink!);
    expect(invited?.status()).toBe(200);
    await expect(strangerPage.getByRole("heading", { name: /Test Cafe|Receipt split/i })).toBeVisible();
    await expect(strangerPage.getByText(/View-only link/i)).toBeVisible();
    await expect(strangerPage.getByRole("button", { name: /Record payment/i })).toHaveCount(0);

    await stranger.close();
  });

  test("invalid group id on settlements API returns 404", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.post("/api/groups/not-a-uuid/settlements", {
      headers: sameOriginHeaders(),
      data: {
        fromMemberId: "550e8400-e29b-41d4-a716-446655440000",
        toMemberId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        amountCents: 100,
      },
    });
    expect(res.status()).toBe(404);
  });
});
