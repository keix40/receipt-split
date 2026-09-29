import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { extractWithTesseract } from "@/lib/ocr/tesseract";

const RECEIPT_TEXT = "Coffee 3.50 / Bagel 2.25 / Total 5.75";

describe("tesseract live OCR", () => {
  it(
    "reads a generated receipt PNG including Total 5.75",
    async () => {
      const pngPath = path.join(os.tmpdir(), "receipt-split-verify-receipt.png");
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 420, height: 220 } });
        await page.setContent(`<!DOCTYPE html>
<html><body style="margin:24px;font:28px/1.4 monospace;background:#fff;color:#000">
${RECEIPT_TEXT}
</body></html>`);
        await page.screenshot({ path: pngPath, type: "png" });
      } finally {
        await browser.close();
      }
      expect(fs.existsSync(pngPath)).toBe(true);

      const extraction = await extractWithTesseract(pngPath);
      const joined = [
        ...extraction.items.map((i) => `${i.name} ${i.unitPrice ?? ""}`),
        extraction.total != null ? `Total ${extraction.total}` : "",
      ]
        .join(" ")
        .toLowerCase();
      expect(joined).toMatch(/total/);
      expect(joined).toMatch(/5\.75/);
      if (process.env.VERIFY_TESSERACT_LOG) {
        console.info("[verify:tesseract-ocr]", JSON.stringify(extraction, null, 2));
      }
    },
    120_000,
  );
});
