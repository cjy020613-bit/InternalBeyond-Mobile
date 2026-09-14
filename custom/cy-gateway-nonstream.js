(function () {
  'use strict';

  var PROFILE_ID = 'cy_codex_chen';
  var persisted = false;

  function activeGatewayConfig() {
    try {
      if (typeof _activeCfg !== 'undefined' && _activeCfg && _activeCfg.subscriptionGateway) return _activeCfg;
    } catch (error) {}
    return null;
  }

  function forceActiveNonstream() {
    var cfg = activeGatewayConfig();
    if (!cfg) return false;
    cfg.streaming = false;
    return true;
  }

  async function persistProfile() {
    if (persisted) return;
    try {
      if (typeof dbGetAll !== 'function' || typeof dbPut !== 'function' || typeof db === 'undefined' || !db) return;
      var all = await dbGetAll('apiConfigs');
      var profile = all.find(function (item) { return item && item.id === PROFILE_ID; });
      if (!profile) return;
      if (profile.streaming !== false) {
        profile.streaming = false;
        await dbPut('apiConfigs', profile);
        try { if (typeof loadCfgs === 'function') await loadCfgs(); } catch (error) {}
      }
      persisted = true;
      forceActiveNonstream();
    } catch (error) {}
  }

  function beforeSend(event) {
    var target = event && event.target;
    var send = target && target.closest && target.closest('#cv-send');
    var enter = event && event.type === 'keydown' && event.key === 'Enter';
    if (send || enter) forceActiveNonstream();
  }

  document.addEventListener('pointerdown', beforeSend, true);
  document.addEventListener('touchstart', beforeSend, true);
  document.addEventListener('click', beforeSend, true);
  document.addEventListener('keydown', beforeSend, true);
  window.addEventListener('ibcy:gateway-status', function () {
    forceActiveNonstream();
    persistProfile();
  });

  var tries = 0;
  var timer = window.setInterval(function () {
    tries += 1;
    forceActiveNonstream();
    persistProfile();
    if (persisted && tries >= 20) window.clearInterval(timer);
    if (tries >= 120) window.clearInterval(timer);
  }, 250);
}());
