import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('custom/cy-ob-bridge.js', 'utf8');
const local = new Map();
const session = new Map();
const events = [];
let fetchImpl = async () => ({
  ok: true,
  headers: { get: () => 'application/json' },
  json: async () => ({ ok: true })
});

const storage = (map) => ({
  getItem: (key) => map.has(key) ? map.get(key) : null,
  setItem: (key, value) => map.set(key, String(value)),
  removeItem: (key) => map.delete(key)
});

const shell = {
  register(name, initializer) {
    assert.equal(name, 'ob-bridge');
    initializer(shell);
  }
};

const context = {
  window: {
    IBCY: shell,
    dispatchEvent: (event) => events.push(event),
    dbGetAll: async () => [
      { id: 'a', title: '冬天火锅', content: '一起吃饭' },
      { id: 'b', title: '工作', content: '幼儿园' }
    ]
  },
  localStorage: storage(local),
  sessionStorage: storage(session),
  CustomEvent: class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init.detail; }
  },
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: (...args) => fetchImpl(...args),
  console
};

vm.runInNewContext(source, context, { filename: 'custom/cy-ob-bridge.js' });

assert.equal(shell.ob.getState().status, 'disabled');
shell.ob.configure({
  enabled: true,
  baseUrl: 'https://ob.example.test/',
  token: 'secret-token'
});
assert.equal(shell.ob.getConfig().baseUrl, 'https://ob.example.test');
assert.equal(shell.ob.getConfig().hasToken, true);
assert.equal(JSON.parse(local.get('ibcy.ob.config.v1')).token, undefined);

let requestUrl = '';
let requestHeaders = null;
fetchImpl = async (url, options) => {
  requestUrl = url;
  requestHeaders = options.headers;
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ status: 'ok' })
  };
};
assert.deepEqual(await shell.ob.test(), { status: 'ok' });
assert.equal(requestUrl, 'https://ob.example.test/health');
assert.equal(requestHeaders.Authorization, 'Bearer secret-token');
assert.equal(shell.ob.getState().status, 'online');

shell.ob.configure({ enabled: false });
const fallback = await shell.ob.search('冬天');
assert.equal(fallback.length, 1);
assert.equal(fallback[0].id, 'a');
assert.ok(events.some((event) => event.type === 'ibcy:ob-status'));

console.log('OB bridge smoke test OK');
