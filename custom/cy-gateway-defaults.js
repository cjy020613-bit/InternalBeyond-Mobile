(function () {
  'use strict';
  var key = 'ibcy.gateway.settings.v1';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (error) {}

  /* Friends-template builds must never inherit CY's private Railway gateway. */
  var endpoint = String(saved.endpoint || '');
  if (endpoint.indexOf('codex-gateway-v2-production.up.railway.app') >= 0 ||
      endpoint.indexOf('codex-gateway-production-f16b.up.railway.app') >= 0 ||
      endpoint.indexOf('cjy020613-bit') >= 0) {
    delete saved.endpoint;
    delete saved.token;
  }
  if (!saved.model) saved.model = 'gpt-5.6-terra';
  try { localStorage.setItem(key, JSON.stringify(saved)); } catch (error) {}
}());
