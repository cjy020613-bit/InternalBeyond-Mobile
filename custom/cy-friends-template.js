(function () {
  'use strict';

  var PROFILE_KEY = 'ibcy.friends.profile.v1';
  var GATEWAY_KEY = 'ibcy.gateway.settings.v1';
  var LEGACY_GATEWAY = 'codex-gateway-v2-production.up.railway.app';
  var PROFILE_ID = 'cy_codex_chen';
  var modal = null;
  var patchTimer = 0;

  function readJson(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  }

  function defaults() {
    return {
      initialized: false,
      userName: '',
      aiName: '',
      relationship: '伴侣',
      systemPrompt: ''
    };
  }

  function readProfile() {
    return Object.assign(defaults(), readJson(PROFILE_KEY, {}));
  }

  function buildPrompt(profile) {
    if (String(profile.systemPrompt || '').trim()) return String(profile.systemPrompt).trim();
    var ai = String(profile.aiName || 'AI').trim();
    var user = String(profile.userName || '用户').trim();
    var relation = String(profile.relationship || '陪伴者').trim();
    return '你是' + ai + '，' + user + '的' + relation + '。保持自然、连续、真诚的相处方式，认真记住共同经历，并尊重用户后来对关系、偏好与边界的更新。';
  }

  function sanitizeGatewayDefaults() {
    var saved = readJson(GATEWAY_KEY, {});
    var endpoint = String(saved.endpoint || '');
    if (endpoint.indexOf(LEGACY_GATEWAY) >= 0 || endpoint.indexOf('cjy020613-bit') >= 0) delete saved.endpoint;
    if (!saved.model) saved.model = 'gpt-5.6-terra';
    writeJson(GATEWAY_KEY, saved);
  }

  sanitizeGatewayDefaults();

  function updateVisibleNames() {
    var profile = readProfile();
    if (!profile.initialized) return;
    document.querySelectorAll('.cy-paw-event-actor').forEach(function (node) {
      var row = node.closest('.cy-paw-event-row');
      if (row && row.classList.contains('cy-paw-from-chen')) node.textContent = profile.aiName;
      else if (row && row.classList.contains('cy-paw-from-yingying')) node.textContent = profile.userName;
    });
    var feedback = document.getElementById('cy-paw-feedback');
    if (feedback && /已戳爸爸/.test(feedback.textContent || '')) {
      feedback.textContent = (feedback.textContent || '').replace('爸爸', profile.aiName);
    }
  }

  async function patchAppProfile() {
    var profile = readProfile();
    if (!profile.initialized) return false;
    if (typeof window.dbGetAll !== 'function' || typeof window.dbPut !== 'function') return false;
    try {
      var list = await window.dbGetAll('apiConfigs');
      var current = list.find(function (item) { return item && item.id === PROFILE_ID; });
      if (!current) return false;
      current.nickname = profile.aiName;
      current.relationship = profile.relationship;
      current.systemPrompt = buildPrompt(profile);
      current.subscriptionGateway = true;
      await window.dbPut('apiConfigs', current);
      try {
        if (typeof window._cfgs !== 'undefined' && Array.isArray(window._cfgs)) {
          var cached = window._cfgs.find(function (item) { return item && item.id === PROFILE_ID; });
          if (cached) Object.assign(cached, current);
        }
      } catch (error) {}
      try {
        if (typeof window._activeCfg !== 'undefined' && window._activeCfg && window._activeCfg.id === PROFILE_ID) {
          Object.assign(window._activeCfg, current);
        }
      } catch (error) {}
      try { if (typeof window.renderFriends === 'function') window.renderFriends(); } catch (error) {}
      updateVisibleNames();
      return true;
    } catch (error) {
      return false;
    }
  }

  function keepProfilePatched() {
    window.clearTimeout(patchTimer);
    var tries = 0;
    (function retry() {
      patchAppProfile().then(function (ok) {
        tries += 1;
        if (!ok && tries < 30) patchTimer = window.setTimeout(retry, 250);
      });
    }());
  }

  function rewriteProtocolText(text, profile) {
    var value = String(text == null ? '' : text);
    if (value.indexOf('CY_MUTUAL_PAW') < 0 && value.indexOf('CY_SHARED_INTERACTION_IDENTITY_V2') < 0 && value.indexOf('CY_INTERACTION_RUNTIME') < 0) return value;
    return value.replace(/莹莹/g, profile.userName).replace(/澈/g, profile.aiName);
  }

  function wrapFetch() {
    var current = window.fetch;
    if (!current || current.__ibcyFriendsTemplate) return;
    var wrapped = async function (input, init) {
      try {
        var profile = readProfile();
        if (profile.initialized && init && typeof init.body === 'string') {
          var body = JSON.parse(init.body);
          if (Array.isArray(body.messages)) {
            body.messages = body.messages.map(function (message) {
              var next = Object.assign({}, message);
              if (typeof next.content === 'string') next.content = rewriteProtocolText(next.content, profile);
              return next;
            });
          }
          if (body.prompt_blocks && typeof body.prompt_blocks === 'object') {
            body.prompt_blocks = Object.assign({}, body.prompt_blocks);
            Object.keys(body.prompt_blocks).forEach(function (key) {
              if (typeof body.prompt_blocks[key] === 'string') body.prompt_blocks[key] = rewriteProtocolText(body.prompt_blocks[key], profile);
            });
            body.prompt_blocks.identity = buildPrompt(profile);
          }
          init = Object.assign({}, init, { body: JSON.stringify(body) });
        }
      } catch (error) {}
      return current(input, init);
    };
    wrapped.__ibcyFriendsTemplate = true;
    window.fetch = wrapped;
  }

  function installFetchGuard() {
    var tries = 0;
    (function retry() {
      wrapFetch();
      tries += 1;
      if (tries < 24) window.setTimeout(retry, 300);
    }());
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'cy-ft-mask';
    modal.id = 'cy-ft-mask';
    modal.innerHTML = '<section class="cy-ft-card" role="dialog" aria-modal="true" aria-labelledby="cy-ft-title">' +
      '<div class="cy-ft-kicker">INTERNALBEYOND · FRIENDS TEMPLATE</div>' +
      '<h2 id="cy-ft-title">先把这里变成你们自己的</h2>' +
      '<p class="cy-ft-intro">这个版本保留双向互动、模型选择和 Codex 登录，但不会带入原作者的私人身份、聊天或网关。</p>' +
      '<div class="cy-ft-grid">' +
        '<label><span>你的名字</span><input id="cy-ft-user" maxlength="24" placeholder="例如：小夏"></label>' +
        '<label><span>AI 的名字</span><input id="cy-ft-ai" maxlength="24" placeholder="例如：阿川"></label>' +
        '<label><span>你们的关系</span><input id="cy-ft-relation" maxlength="32" placeholder="例如：恋人 / 搭档 / 朋友"></label>' +
      '</div>' +
      '<label class="cy-ft-prompt"><span>AI 人设（可选）</span><textarea id="cy-ft-prompt" rows="5" placeholder="留空会根据上面的名字和关系自动生成。"></textarea></label>' +
      '<div class="cy-ft-note">下一步会让你连接<strong>你自己的</strong> Codex 网关。不要使用别人的 Railway 地址或配对口令。</div>' +
      '<button id="cy-ft-save" class="cy-ft-primary" type="button">保存并继续</button>' +
      '<small class="cy-ft-license">非商业模板；请保留仓库中的 LICENSE 与 Required Notice。</small>' +
      '</section>';
    document.body.appendChild(modal);
    modal.querySelector('#cy-ft-save').addEventListener('click', saveOnboarding);
    return modal;
  }

  async function saveOnboarding() {
    ensureModal();
    var userName = modal.querySelector('#cy-ft-user').value.trim();
    var aiName = modal.querySelector('#cy-ft-ai').value.trim();
    var relationship = modal.querySelector('#cy-ft-relation').value.trim() || '伴侣';
    var systemPrompt = modal.querySelector('#cy-ft-prompt').value.trim();
    if (!userName || !aiName) {
      modal.classList.remove('cy-ft-shake');
      void modal.offsetWidth;
      modal.classList.add('cy-ft-shake');
      return;
    }
    var profile = { initialized: true, userName: userName, aiName: aiName, relationship: relationship, systemPrompt: systemPrompt };
    writeJson(PROFILE_KEY, profile);
    window.IBCY_FRIENDS_PROFILE = profile;
    await patchAppProfile();
    updateVisibleNames();
    modal.hidden = true;
    window.dispatchEvent(new CustomEvent('ibcy:friends-profile-change', { detail: profile }));
    window.setTimeout(function () {
      try {
        if (window.IBCY && window.IBCY.gateway && typeof window.IBCY.gateway.openSetup === 'function') window.IBCY.gateway.openSetup();
      } catch (error) {}
    }, 500);
  }

  function openOnboarding() {
    var profile = readProfile();
    var box = ensureModal();
    box.querySelector('#cy-ft-user').value = profile.userName || '';
    box.querySelector('#cy-ft-ai').value = profile.aiName || '';
    box.querySelector('#cy-ft-relation').value = profile.relationship || '伴侣';
    box.querySelector('#cy-ft-prompt').value = profile.systemPrompt || '';
    box.hidden = false;
  }

  function boot() {
    var profile = readProfile();
    window.IBCY_FRIENDS_PROFILE = profile;
    installFetchGuard();
    keepProfilePatched();
    updateVisibleNames();
    if (!profile.initialized) openOnboarding();

    if (window.MutationObserver) {
      new MutationObserver(function () { updateVisibleNames(); }).observe(document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener('ibcy:interaction', updateVisibleNames);
    window.addEventListener('ibcy:interaction-lexicon-change', updateVisibleNames);
  }

  window.IBCYFriendsTemplate = {
    getProfile: readProfile,
    openOnboarding: openOnboarding,
    patchProfile: patchAppProfile
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
