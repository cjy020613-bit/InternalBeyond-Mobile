(function () {
  'use strict';
  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    window.addEventListener('ibcy:friends-profile-change', async function () {
      try { if (typeof loadCfgs === 'function') await loadCfgs(); } catch (error) {}
      try { if (typeof renderFriends === 'function') renderFriends(); } catch (error) {}
      window.setTimeout(function () {
        try {
          if (shell.gateway && typeof shell.gateway.openSetup === 'function') shell.gateway.openSetup();
        } catch (error) {}
      }, 180);
    });
  });
}());
