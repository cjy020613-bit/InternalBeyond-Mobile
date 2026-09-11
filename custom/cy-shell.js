(function () {
  'use strict';

  var api = window.IBCY || {};
  var queue = [];
  var started = false;

  api.version = '0.1.0';
  api.register = function (name, initializer) {
    if (typeof initializer !== 'function') return;
    var module = { name: String(name || 'anonymous'), initializer: initializer };
    if (started) run(module);
    else queue.push(module);
  };

  function run(module) {
    try {
      module.initializer(api);
    } catch (error) {
      console.error('[IBCY] module failed:', module.name, error);
    }
  }

  function boot() {
    if (started) return;
    started = true;
    document.documentElement.setAttribute('data-cy-shell', 'ready');
    document.documentElement.setAttribute('data-cy-version', api.version);
    while (queue.length) run(queue.shift());
    window.dispatchEvent(new CustomEvent('ibcy:ready', { detail: { version: api.version } }));
  }

  api.ready = function (callback) {
    if (typeof callback !== 'function') return;
    if (started) callback(api);
    else window.addEventListener('ibcy:ready', function () { callback(api); }, { once: true });
  };

  window.IBCY = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
