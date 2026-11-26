// The web preview's map (maplibre-gl) runs its tile work in a Web Worker that
// can't go through the bundler. Copy the worker files into public/ so Expo
// serves them, matching whatever maplibre-gl version is installed.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist');
const dest = path.join(__dirname, '..', 'public', 'maplibre');
if (!fs.existsSync(src)) process.exit(0);
fs.mkdirSync(dest, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
