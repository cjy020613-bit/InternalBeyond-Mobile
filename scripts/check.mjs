import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'index.html',
  'ib-sw.js',
  'manifest.webmanifest',
  'apps/catalog.json',
  'apps/catalog.js',
  'apps/ib-app-cinema.js',
  'custom/cy-shell.css',
  'custom/cy-shell.js',
  'custom/cy-ob-bridge.js'
];

await Promise.all(requiredFiles.map((file) => access(file)));

const [html, manifestText, catalogText, serviceWorker] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('manifest.webmanifest', 'utf8'),
  readFile('apps/catalog.json', 'utf8'),
  readFile('ib-sw.js', 'utf8')
]);

for (const asset of ['./custom/cy-shell.css', './custom/cy-shell.js', './custom/cy-ob-bridge.js', './manifest.webmanifest']) {
  if (!html.includes(asset)) throw new Error(`index.html is missing ${asset}`);
}

for (const asset of ['./custom/cy-shell.css', './custom/cy-shell.js', './custom/cy-ob-bridge.js']) {
  if (!serviceWorker.includes(asset)) throw new Error(`ib-sw.js is not caching ${asset}`);
}

const manifest = JSON.parse(manifestText);
const catalog = JSON.parse(catalogText);
if (!manifest.name || !manifest.short_name || !manifest.start_url) throw new Error('PWA manifest is incomplete');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('PWA icons are incomplete');
if (!Array.isArray(catalog.apps)) throw new Error('apps/catalog.json has no apps array');

console.log(`IB CY baseline OK: ${requiredFiles.length} files, ${catalog.apps.length} app(s)`);
