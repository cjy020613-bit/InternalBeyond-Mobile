import { access, readFile } from 'node:fs/promises';

const required = [
  'custom/cy-friends-template.js',
  'custom/cy-friends-template.css',
  'custom/cy-friends-template-bridge.js',
  'FRIENDS_TEMPLATE.md',
  'LICENSE'
];
await Promise.all(required.map((file) => access(file)));

const [runtime, styles, bridge, defaults, sw, guide, license] = await Promise.all([
  readFile('custom/cy-friends-template.js', 'utf8'),
  readFile('custom/cy-friends-template.css', 'utf8'),
  readFile('custom/cy-friends-template-bridge.js', 'utf8'),
  readFile('custom/cy-gateway-defaults.js', 'utf8'),
  readFile('ib-sw.js', 'utf8'),
  readFile('FRIENDS_TEMPLATE.md', 'utf8'),
  readFile('LICENSE', 'utf8')
]);

for (const asset of ['./custom/cy-friends-template.js', './custom/cy-friends-template.css', './custom/cy-friends-template-bridge.js']) {
  if (!sw.includes(asset)) throw new Error(`friends template asset is not wired: ${asset}`);
}
if (!sw.includes('ib-cache-v23-friends-template')) throw new Error('friends template cache version is missing');
if (!runtime.includes('ibcy.friends.profile.v1') || !runtime.includes('patchAppProfile') || !runtime.includes('rewriteProtocolText')) {
  throw new Error('friends template identity/runtime adapter is incomplete');
}
if (!runtime.includes('你的名字') || !runtime.includes('AI 的名字') || !runtime.includes('保存并继续')) {
  throw new Error('friends template first-run onboarding is incomplete');
}
if (!runtime.includes('CY_MUTUAL_PAW') || !runtime.includes('CY_SHARED_INTERACTION_IDENTITY_V2')) {
  throw new Error('friends template does not rewrite hidden interaction identity text');
}
if (!styles.includes('.cy-ft-mask') || !styles.includes('.cy-ft-card')) {
  throw new Error('friends template onboarding styles are incomplete');
}
if (!bridge.includes('ibcy:friends-profile-change') || !bridge.includes('loadCfgs') || !bridge.includes('shell.gateway.openSetup')) {
  throw new Error('friends template onboarding handoff is incomplete');
}
if (defaults.includes('saved.endpoint = newEndpoint') || defaults.includes("saved.endpoint = 'https://codex-gateway")) {
  throw new Error('friends template still assigns a private default gateway');
}
if (!defaults.includes('delete saved.endpoint') || !defaults.includes('delete saved.token')) {
  throw new Error('friends template does not clear inherited private gateway credentials');
}
if (!guide.includes('release/friends-template') || !guide.includes('CY_GATEWAY_TOKEN') || !guide.includes('/app/data')) {
  throw new Error('friends template deployment guide is incomplete');
}
if (!license.includes('PolyForm Noncommercial License 1.0.0') || !license.includes('Required Notice:')) {
  throw new Error('upstream noncommercial license/notice is missing');
}

console.log('Friends template OK: private gateway defaults removed, first-run identity + hidden prompt rewrite + gateway handoff + deployment guide present');
