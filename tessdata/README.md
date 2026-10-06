# Bundled Tesseract language data

`eng.traineddata.gz` and `mya.traineddata.gz` are the `4.0.0_best_int` LSTM models from
[`@tesseract.js-data`](https://www.npmjs.com/org/tesseract.js-data) (originally
[tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata), Apache-2.0).

They are bundled into the `/api/ocr` serverless function (see `outputFileTracingIncludes` in
`next.config.ts`) so cold starts don't depend on a CDN download. If the files are missing at
runtime, `src/lib/ocr/tesseract.ts` falls back to the jsDelivr CDN.
