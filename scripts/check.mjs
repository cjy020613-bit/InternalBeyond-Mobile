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
  'custom/cy-codex-auth.css',
  'custom/cy-codex-auth.js',
  'custom/cy-mutual-paw.css',
  'custom/cy-mutual-paw.js',
  'custom/cy-identity.css',
  'custom/cy-identity.js',
  'gateway/app.py',
  'gateway/codex_bridge.py',
  'gateway/store.py',
  'gateway/requirements.txt'
];

await Promise.all(requiredFiles.map((file) => access(file)));

const [manifestText, catalogText, serviceWorker, mutualPaw, identity, codexAuth, codexBridge, requirements] = await Promise.all([
  readFile('manifest.webmanifest', 'utf8'),
  readFile('apps/catalog.json', 'utf8'),
  readFile('ib-sw.js', 'utf8'),
  readFile('custom/cy-mutual-paw.js', 'utf8'),
  readFile('custom/cy-identity.js', 'utf8'),
  readFile('custom/cy-codex-auth.js', 'utf8'),
  readFile('gateway/codex_bridge.py', 'utf8'),
  readFile('gateway/requirements.txt', 'utf8')
]);

for (const asset of [
  './custom/cy-shell.css',
  './custom/cy-shell.js',
  './custom/cy-ob-bridge.js',
  './custom/cy-mutual-paw.css',
  './custom/cy-mutual-paw.js',
  './custom/cy-identity.css',
  './custom/cy-identity.js',
  './custom/cy-codex-auth.css',
  './custom/cy-codex-auth.js'
]) {
  if (!serviceWorker.includes(asset)) throw new Error(`ib-sw.js is not wiring ${asset}`);
}
if (!serviceWorker.includes('data-ibcy-loader')) throw new Error('ib-sw.js is missing the CY HTML injection marker');
if (!mutualPaw.includes('CY_MUTUAL_PAW') || !mutualPaw.includes('shell.paw.receive')) {
  throw new Error('mutual paw protocol is incomplete');
}
if (!identity.includes('shell.identity') || !identity.includes('ibcy.identity.profiles.v1')) {
  throw new Error('identity avatar layer is incomplete');
}
if (!codexAuth.includes('login/device') || !codexAuth.includes('login_chatgpt')) {
  throw new Error('Codex device-login UI is incomplete');
}
if (!codexBridge.includes('AsyncCodex') || !codexBridge.includes('login_chatgpt_device_code')) {
  throw new Error('gateway is not using the official Codex SDK login flow');
}
if (!requirements.includes('openai-codex')) {
  throw new Error('gateway requirements are missing openai-codex');
}

const manifest = JSON.parse(manifestText);
const catalog = JSON.parse(catalogText);
if (!manifest.name || !manifest.short_name || !manifest.start_url) throw new Error('PWA manifest is incomplete');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('PWA icons are incomplete');
if (!Array.isArray(catalog.apps)) throw new Error('apps/catalog.json has no apps array');

console.log(`IB CY synced baseline OK: ${requiredFiles.length} files, ${catalog.apps.length} app(s), mutual paw + identity + Codex auth enabled`);
