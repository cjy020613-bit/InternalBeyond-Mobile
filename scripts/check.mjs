import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const required = [
  'index.html', 'ib-sw.js', 'manifest.webmanifest',
  'apps/catalog.json','apps/catalog.js','apps/ib-app-cinema.js',
  'custom/ib-codex-provider.js','gateway/app.py',
  'gateway/codex_bridge.py','gateway/store.py','gateway/requirements.txt'
];
await Promise.all(required.map((path) => access(path)));
const [html,sw,provider,backend,bridge,manifestText,catalogText] = await Promise.all([
  readFile('index.html','utf8'),
  readFile('ib-sw.js','utf8'),
  readFile('custom/ib-codex-provider.js','utf8'),
  readFile('gateway/app.py','utf8'),
  readFile('gateway/codex_bridge.py','utf8'),
  readFile('manifest.webmanifest','utf8'),
  readFile('apps/catalog.json','utf8')
]);
const manifest=JSON.parse(manifestText);
const catalog=JSON.parse(catalogText);
assert.ok(manifest.name && manifest.start_url && manifest.icons.length>=2);
assert.ok(Array.isArray(catalog.apps));
assert.ok(html.includes('const PROVIDERS={') && html.includes('id="aset-provider"'));
assert.ok(html.includes('id="aset-key"') && html.includes('id="aset-model"'));
assert.ok(html.includes('function openAset(c)') && html.includes('async function callAI('));
assert.ok(html.includes('function _msgAva(m)') && html.includes('_sameSender(m,prev)'));
assert.ok(sw.includes('custom/ib-codex-provider.js'));
assert.ok(sw.includes('data-ib-native-codex'));
assert.ok(!sw.includes('data-ibcy-loader'), 'old CY overlay must be inactive');
assert.ok(!sw.includes('custom/cy-shell.js'), 'old CY shell must not load');
assert.ok(!sw.includes('custom/cy-mutual-paw.js'), 'old paw overlay must not load');
assert.ok(provider.includes("PROVIDERS[ID]="), 'Codex must be inserted in native service provider catalog');
assert.ok(provider.includes("sel.insertBefore(opt,custom)"), 'Codex must appear in native service provider picker');
assert.ok(provider.includes("dbGetAll('apiConfigs')"), 'previous native chat data must be migrated in place');
assert.ok(provider.includes("cfg.provider=ID"), 'legacy CY profiles should become Codex profiles');
assert.ok(provider.includes('body.conversation_id='), 'gateway thread identity must be stable');
assert.ok(provider.includes('body.prompt_blocks='), 'gateway must receive identity context');
assert.ok(provider.includes('/v1/codex/login/device'), 'ChatGPT device login is missing');
assert.ok(provider.includes('/v1/codex/status'), 'ChatGPT account status is missing');
assert.ok(backend.includes('@app.post("/v1/chat/completions"') && backend.includes('dependencies=[Depends(authorize)]'));
assert.ok(backend.includes('@app.get("/v1/models"') && backend.includes('@app.post("/v1/codex/login/device"'));
assert.ok(bridge.includes('AsyncCodex') && bridge.includes('login_chatgpt_device_code'));
console.log('IB v3.1.3 stock UI + native Codex provider wiring OK. No legacy CY overlay scripts loaded.');
