#!/usr/bin/env node
/**
 * After `next build`, verify the OCR route trace includes tesseract worker files.
 * Run: node scripts/verify-tesseract-tracing.mjs
 */
import fs from "node:fs";
import path from "node:path";

const nftPath = path.join(".next/server/app/api/ocr/route.js.nft.json");
if (!fs.existsSync(nftPath)) {
  console.error(`Missing trace file: ${nftPath}. Run npm run build first.`);
  process.exit(1);
}

const { files } = JSON.parse(fs.readFileSync(nftPath, "utf8"));
const requiredSubstrings = [
  "tesseract.js/src/worker-script/node/index.js",
  "tesseract.js/src/worker-script/index.js",
  "tesseract.js-core/tesseract-core",
];

const missing = requiredSubstrings.filter((needle) => !files.some((f) => f.includes(needle)));
if (missing.length > 0) {
  console.error("OCR route trace is missing tesseract files:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log(`OK: ${files.length} traced files; tesseract worker paths present.`);
