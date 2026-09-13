(function () {
  'use strict';
  var key = 'ibcy.gateway.settings.v1';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (error) {}
  var oldBase = 'https://codex-gateway-production-f16b.up.railway.app';
  var newEndpoint = 'https://codex-gateway-v2-production.up.railway.app/v1/chat/completions';
  if (!saved.endpoint || String(saved.endpoint).indexOf(oldBase) === 0) saved.endpoint = newEndpoint;
  if (!saved.model) saved.model = 'gpt-5.6-terra';
  try { localStorage.setItem(key, JSON.stringify(saved)); } catch (error) {}
}());
