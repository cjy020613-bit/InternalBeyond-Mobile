import { readFile } from 'node:fs/promises';

const [picker, pickerCss, sw, gateway, app, bridge] = await Promise.all([
  readFile('custom/cy-model-picker.js', 'utf8'),
  readFile('custom/cy-model-picker.css', 'utf8'),
  readFile('ib-sw.js', 'utf8'),
  readFile('custom/cy-gateway.js', 'utf8'),
  readFile('gateway/app.py', 'utf8'),
  readFile('gateway/codex_bridge.py', 'utf8')
]);

for (const asset of ['./custom/cy-model-picker.js', './custom/cy-model-picker.css']) {
  if (!sw.includes(asset)) throw new Error(`service worker is not wiring ${asset}`);
}
if (!picker.includes('/v1/models') || !picker.includes('ibcy:model-change') || !picker.includes('ensureProfile')) {
  throw new Error('model picker does not fetch, persist, and announce model changes');
}
if (!picker.includes('#cy-model-pill') || !picker.includes('stopImmediatePropagation')) {
  throw new Error('model picker is not intercepting the composer model pill');
}
if (!pickerCss.includes('.cy-model-sheet') || !pickerCss.includes('.cy-model-option.selected')) {
  throw new Error('model picker styles are incomplete');
}
if (!gateway.includes("SETTINGS_KEY = 'ibcy.gateway.settings.v1'") || !gateway.includes('profile.model = settings.model')) {
  throw new Error('gateway settings/profile model persistence is missing');
}
if (!app.includes('@app.get("/v1/models"') || !app.includes('await bridge.account_status()')) {
  throw new Error('gateway /v1/models endpoint is missing');
}
if (!bridge.includes('await self.client.models()')) {
  throw new Error('gateway is not reading the official Codex model list');
}

console.log('CY dynamic Codex model picker wiring OK');
