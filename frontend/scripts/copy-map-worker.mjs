// MapLibre loads its web worker from a URL. Next bundles the main library, so we ship the
// worker as a same-origin static file (keeps the CSP at worker-src 'self').
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
mkdirSync("public/vendor", { recursive: true });
copyFileSync(join(pkgDir, "dist/maplibre-gl-worker.mjs"), "public/vendor/maplibre-gl-worker.mjs");
