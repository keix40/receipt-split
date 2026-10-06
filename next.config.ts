import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns worker threads and loads files at runtime; keep it out of the bundle.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  outputFileTracingIncludes: {
    "/api/ocr": [
      // Bundled mya + eng traineddata (no CDN download on cold start).
      "./tessdata/*.traineddata.gz",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/zlibjs/**/*",
    ],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
