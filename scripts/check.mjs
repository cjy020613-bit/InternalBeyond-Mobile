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
  'custom/cy-gateway-defaults.js',
  'custom/cy-mutual-paw.css',
  'custom/cy-mutual-paw.js',
  'custom/cy-interaction-lexicon.js',
  'custom/cy-interaction-protocol-v2.js',
  'custom/cy-interaction-editor.css',
  'custom/cy-identity.css',
  'custom/cy-identity.js',
  'custom/cy-chat-polish.css',
  'custom/cy-chat-polish.js',
  'gateway/app.py',
  'gateway/codex_bridge.py',
  'gateway/store.py',
  'gateway/requirements.txt',
  'gateway/Dockerfile'
];

await Promise.all(requiredFiles.map((file) => access(file)));

const [manifestText, catalogText, serviceWorker, mutualPaw, lexicon, protocolV2, identity, chatPolish, chatPolishCss, editorCss, gatewayUi, gatewayDefaults, codexBridge, requirements, gatewayApp] = await Promise.all([
  readFile('manifest.webmanifest', 'utf8'),
  readFile('apps/catalog.json', 'utf8'),
  readFile('ib-sw.js', 'utf8'),
  readFile('custom/cy-mutual-paw.js', 'utf8'),
  readFile('custom/cy-interaction-lexicon.js', 'utf8'),
  readFile('custom/cy-interaction-protocol-v2.js', 'utf8'),
  readFile('custom/cy-identity.js', 'utf8'),
  readFile('custom/cy-chat-polish.js', 'utf8'),
  readFile('custom/cy-chat-polish.css', 'utf8'),
  readFile('custom/cy-interaction-editor.css', 'utf8'),
  readFile('custom/cy-gateway.js', 'utf8'),
  readFile('custom/cy-gateway-defaults.js', 'utf8'),
  readFile('gateway/codex_bridge.py', 'utf8'),
  readFile('gateway/requirements.txt', 'utf8'),
  readFile('gateway/app.py', 'utf8')
]);

for (const asset of [
  './custom/cy-shell.css',
  './custom/cy-shell.js',
  './custom/cy-ob-bridge.js',
  './custom/cy-gateway-defaults.js',
  './custom/cy-mutual-paw.css',
  './custom/cy-mutual-paw.js',
  './custom/cy-interaction-lexicon.js',
  './custom/cy-interaction-protocol-v2.js',
  './custom/cy-interaction-editor.css',
  './custom/cy-identity.css',
  './custom/cy-identity.js',
  './custom/cy-chat-polish.css',
  './custom/cy-chat-polish.js'
]) {
  if (!serviceWorker.includes(asset)) throw new Error(`ib-sw.js is not wiring ${asset}`);
}
if (!serviceWorker.includes('data-ibcy-loader')) throw new Error('ib-sw.js is missing the CY HTML injection marker');
if (!mutualPaw.includes('CY_MUTUAL_PAW') || !mutualPaw.includes('shell.paw.receive')) {
  throw new Error('mutual paw protocol is incomplete');
}
if (!lexicon.includes('ibcy.interaction.lexicon.v1') || !lexicon.includes('sendInteraction') || !lexicon.includes('receiveInteraction') || !lexicon.includes('body_target')) {
  throw new Error('shared interaction lexicon is incomplete');
}
if (!protocolV2.includes('CY_INTERACTION_RUNTIME') || !protocolV2.includes('body_target') || !protocolV2.includes('receiveInteraction') || !protocolV2.includes('interaction-lexicon-change')) {
  throw new Error('dynamic interaction protocol v2 is incomplete');
}
if (!identity.includes('shell.identity') || !identity.includes('ibcy.identity.profiles.v1')) {
  throw new Error('identity avatar layer is incomplete');
}
if (!chatPolish.includes('cy-chat-identity-row') || !chatPolish.includes('cy-compose-confirm') || !chatPolish.includes('cy-model-pill')) {
  throw new Error('chat polish layer is incomplete');
}
if (!chatPolish.includes('cy-chat-turn-start') || !chatPolish.includes('cy-chat-avatar-placeholder') || !chatPolishCss.includes('cy-chat-avatar-placeholder')) {
  throw new Error('one-avatar-per-turn grouping is incomplete');
}
if (!chatPolish.includes('cy-compose-edit') || !chatPolish.includes('saveLexicon') || !editorCss.includes('cy-compose-editor-row')) {
  throw new Error('editable interaction composer is incomplete');
}
if (!gatewayUi.includes('/v1/codex/login/device') || !gatewayUi.includes('登录 ChatGPT')) {
  throw new Error('Codex device-login UI is incomplete');
}
if (!gatewayDefaults.includes('codex-gateway-v2-production.up.railway.app')) {
  throw new Error('CY gateway defaults are not pointing at Railway v2');
}
if (!codexBridge.includes('AsyncCodex') || !codexBridge.includes('login_chatgpt_device_code')) {
  throw new Error('gateway is not using the official Codex SDK login flow');
}
if (!gatewayApp.includes('/v1/codex/login/device') || !gatewayApp.includes('logged_in')) {
  throw new Error('gateway API is missing Codex login/status wiring');
}
if (!requirements.includes('openai-codex')) {
  throw new Error('gateway requirements are missing openai-codex');
}

const manifest = JSON.parse(manifestText);
const catalog = JSON.parse(catalogText);
if (!manifest.name || !manifest.short_name || !manifest.start_url) throw new Error('PWA manifest is incomplete');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('PWA icons are incomplete');
if (!Array.isArray(catalog.apps)) throw new Error('apps/catalog.json has no apps array');

console.log(`IB CY synced baseline OK: ${requiredFiles.length} files, ${catalog.apps.length} app(s), dynamic interaction protocol v2 + editable shared interactions + one-avatar turns + chat polish + mutual paw + identity + official Codex login enabled`);
