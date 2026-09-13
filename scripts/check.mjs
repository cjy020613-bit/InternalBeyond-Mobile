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
  'custom/cy-ob-bridge.js',
  'custom/cy-gateway.css',
  'custom/cy-gateway.js',
  'gateway/app.py',
  'gateway/codex_bridge.py',
  'gateway/store.py'
];

await Promise.all(requiredFiles.map((file) => access(file)));

const [manifestText, catalogText, serviceWorker] = await Promise.all([
  readFile('manifest.webmanifest', 'utf8'),
  readFile('apps/catalog.json', 'utf8'),
  readFile('ib-sw.js', 'utf8')
]);

for (const asset of ['./custom/cy-shell.css', './custom/cy-shell.js', './custom/cy-ob-bridge.js']) {
  if (!serviceWorker.includes(asset)) throw new Error(`ib-sw.js is not wiring ${asset}`);
}
if (!serviceWorker.includes('data-ibcy-loader')) throw new Error('ib-sw.js is missing the CY HTML injection marker');

const manifest = JSON.parse(manifestText);
const catalog = JSON.parse(catalogText);
if (!manifest.name || !manifest.short_name || !manifest.start_url) throw new Error('PWA manifest is incomplete');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('PWA icons are incomplete');
if (!Array.isArray(catalog.apps)) throw new Error('apps/catalog.json has no apps array');

console.log(`IB CY synced baseline OK: ${requiredFiles.length} files, ${catalog.apps.length} app(s)`);
