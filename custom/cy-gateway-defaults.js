(function () {
  'use strict';
  var key = 'ibcy.gateway.settings.v1';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (error) {}
  if (!saved.endpoint) saved.endpoint = 'https://codex-gateway-production-f16b.up.railway.app/v1/chat/completions';
  if (!saved.model) saved.model = 'gpt-5.6-terra';
  try { localStorage.setItem(key, JSON.stringify(saved)); } catch (error) {}
}());
