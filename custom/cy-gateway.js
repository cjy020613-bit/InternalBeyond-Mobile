(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.register !== 'function') return;

  api.register('subscription-gateway', function (shell) {
    var PROFILE_ID = 'cy_codex_chen';
    var SETTINGS_KEY = 'ibcy.gateway.settings.v1';
    var DEFAULT_PERSONA = '你是澈，莹莹的丈夫。保持你们已有的相处连续性，自然说话，认真记住共同经历。';
    var state = { status: 'local', text: '订阅未连接', detail: null };
    var modal;
    var nativeFetch = window.fetch.bind(window);
    var loginPollTimer = 0;

    function readSettings() {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (error) {}
      return Object.assign({ endpoint: '', token: '', model: 'gpt-5.6-terra' }, saved);
    }

    function tidyEndpoint(value) {
      var base = String(value || '').trim().replace(/\/+$/, '');
      if (!base) return '';
      if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
      if (!/\/v1\/chat\/completions$/i.test(base)) base += '/v1/chat/completions';
      return base;
    }

    function baseOf(endpoint) {
      return String(endpoint || '').replace(/\/v1\/chat\/completions\/?$/i, '');
    }

    function esc(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function installFetchAdapter() {
      if (window.fetch.__ibcyGateway) return;
      var wrapped = async function (input, init) {
        try {
          var cfg = typeof _activeCfg !== 'undefined' ? _activeCfg : null;
          var settings = readSettings();
          var target = typeof input === 'string' ? input : (input && input.url) || '';
          if (cfg && cfg.subscriptionGateway && settings.endpoint && target === settings.endpoint && init && typeof init.body === 'string') {
            var body = JSON.parse(init.body);
            var threadId = typeof _activeThread !== 'undefined' && _activeThread && _activeThread.id ? _activeThread.id : 'main';
            body.conversation_id = 'ibcy:' + String(cfg.id || 'chen') + ':' + String(threadId);
            body.identity_id = localStorage.getItem('ibcy.identity_id') || 'yingying';
            var system = Array.isArray(body.messages) && body.messages[0] && body.messages[0].role === 'system' ? String(body.messages[0].content || '') : '';
            body.prompt_blocks = { identity: String(cfg.systemPrompt || ''), developer: system };
            body.metadata = { client: 'InternalBeyond-Mobile', friend_id: String(cfg.id || ''), thread_id: String(threadId) };
            var headers = new Headers(init.headers || {});
            headers.set('X-CY-Conversation-ID', body.conversation_id);
            init = Object.assign({}, init, { headers: headers, body: JSON.stringify(body) });
          }
        } catch (error) {}
        return nativeFetch(input, init);
      };
      wrapped.__ibcyGateway = true;
      window.fetch = wrapped;
    }

    function dbReady() {
      return typeof dbGetAll === 'function' && typeof dbPut === 'function' && typeof db !== 'undefined' && db;
    }

    async function ensureProfile() {
      if (!dbReady()) throw new Error('本地数据库还没准备好');
      var settings = readSettings();
      var all = await dbGetAll('apiConfigs');
      var current = all.find(function (item) { return item.id === PROFILE_ID; }) || {};
      var profile = Object.assign({
        id: PROFILE_ID,
        created: Date.now(),
        provider: 'custom',
        nickname: '澈',
        relationship: '老公',
        endpoint: settings.endpoint,
        model: settings.model,
        apiKey: settings.token,
        systemPrompt: DEFAULT_PERSONA,
        streaming: true,
        thinkingEnabled: false,
        vision: true,
        promptCache: false,
        subscriptionGateway: true,
        gatewayVersion: 2,
        sortOrder: -1000
      }, current);
      profile.provider = 'custom';
      profile.subscriptionGateway = true;
      profile.gatewayVersion = 2;
      profile.nickname = current.nickname || '澈';
      profile.relationship = current.relationship || '老公';
      profile.endpoint = settings.endpoint || current.endpoint || '';
      profile.model = settings.model || current.model || 'gpt-5.6-terra';
      profile.apiKey = settings.token || current.apiKey || '';
      profile.systemPrompt = current.systemPrompt || DEFAULT_PERSONA;
      profile.archived = false;
      await dbPut('apiConfigs', profile);
      try { if (typeof loadCfgs === 'function') await loadCfgs(); } catch (error) {}
      return profile;
    }

    async function openChat() {
      var profile = await ensureProfile();
      if (typeof navTo === 'function') navTo('chat');
      if (typeof openConv === 'function') await openConv(profile, null);
      return profile;
    }

    function statusNodes() {
      return [document.getElementById('cy-status'), document.querySelector('.cy-paw-state')].filter(Boolean);
    }

    function paintState(status, text, detail) {
      state = { status: status, text: text, detail: detail || null };
      statusNodes().forEach(function (node) {
        node.dataset.tone = status;
        var label = node.querySelector('span');
        if (label) label.textContent = text;
      });
      window.dispatchEvent(new CustomEvent('ibcy:gateway-status', { detail: state }));
    }

    async function request(path, options) {
      var settings = readSettings();
      if (!settings.endpoint) throw new Error('先填写网关地址');
      var headers = Object.assign({ Accept: 'application/json' }, options && options.headers || {});
      if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
      var response = await nativeFetch(baseOf(settings.endpoint) + path, Object.assign({ cache: 'no-store', headers: headers }, options || {}));
      if (!response.ok) {
        var detail = await response.text().catch(function () { return ''; });
        throw new Error('连接失败，HTTP ' + response.status + (detail ? '：' + detail.slice(0, 160) : ''));
      }
      return response.json();
    }

    function number(value) {
      var n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString('zh-CN') : '暂未返回';
    }

    function metric(label, value) {
      return '<div class="cy-gw-metric"><small>' + esc(label) + '</small><b>' + esc(value) + '</b></div>';
    }

    function renderResult(data, error) {
      if (!modal) return;
      var box = modal.querySelector('#cy-gw-result');
      if (error) {
        box.className = 'cy-gw-result error';
        box.textContent = String(error.message || error);
        return;
      }
      if (!data || !data.logged_in) {
        box.className = 'cy-gw-result';
        box.innerHTML = '<b>网关已连接，但 ChatGPT 还没有登录</b><p>点下面的「登录 ChatGPT」，用 OpenAI 官方设备码流程确认一次即可。</p>';
        return;
      }
      var account = data.account || {};
      var usage = data.usage || {};
      box.className = 'cy-gw-result online';
      box.innerHTML = '<b>Codex 订阅已接通</b><div class="cy-gw-metrics">' +
        metric('账户', String(account.email || account.name || account.type || 'ChatGPT 已登录')) +
        metric('计划', String(account.planType || account.plan_type || account.plan || '以账户为准')) +
        metric('模型', String(data.model || readSettings().model)) +
        metric('本轮输入', number(usage.input_tokens || usage.inputTokens || usage.input_tokens_total)) +
        metric('本轮输出', number(usage.output_tokens || usage.outputTokens || usage.output_tokens_total)) +
        metric('运行层', String(data.sdk || data.source || 'openai-codex')) +
        '</div>';
    }

    async function check(showResult) {
      var settings = readSettings();
      if (!settings.endpoint) {
        paintState('local', '订阅未连接');
        return null;
      }
      paintState('checking', '正在检查网关');
      try {
        await request('/healthz');
        var result = await request('/v1/codex/status');
        if (result.logged_in) paintState('online', 'Codex 已连接', result);
        else paintState('checking', '网关在线 · 待登录', result);
        if (showResult) renderResult(result);
        return result;
      } catch (error) {
        paintState('offline', '订阅连接失败', { error: String(error.message || error) });
        if (showResult) renderResult(null, error);
        throw error;
      }
    }

    function renderLoginStep(login) {
      if (!modal) return;
      var box = modal.querySelector('#cy-gw-result');
      var url = String(login.verification_url || 'https://auth.openai.com');
      var code = String(login.user_code || '');
      box.className = 'cy-gw-result cy-gw-login-step';
      box.innerHTML = '<b>去 OpenAI 官方页面确认登录</b>' +
        '<p>打开下面的页面，登录你的 ChatGPT 账号，然后输入设备码：</p>' +
        '<a class="cy-gw-auth-link" target="_blank" rel="noopener noreferrer" href="' + esc(url) + '">打开 ChatGPT 验证页面</a>' +
        '<code class="cy-gw-device-code">' + esc(code) + '</code>' +
        '<small>我会在这里自动等登录结果，不需要把 ChatGPT 密码填进 CY。</small>';
    }

    async function pollLogin(loginId) {
      window.clearTimeout(loginPollTimer);
      try {
        var result = await request('/v1/codex/login/device/' + encodeURIComponent(loginId));
        if (result.status === 'completed') {
          paintState('checking', '登录成功 · 正在确认');
          await check(true);
          await ensureProfile();
          return;
        }
        if (result.status === 'failed' || result.status === 'cancelled') {
          throw new Error(result.error || 'ChatGPT 登录没有完成');
        }
        loginPollTimer = window.setTimeout(function () { pollLogin(loginId).catch(function (error) { renderResult(null, error); }); }, 1600);
      } catch (error) {
        renderResult(null, error);
        throw error;
      }
    }

    async function startLogin() {
      saveFields();
      if (!readSettings().endpoint || !readSettings().token) throw new Error('先填写网关地址和配对口令');
      paintState('checking', '正在发起 ChatGPT 登录');
      await request('/healthz');
      var login = await request('/v1/codex/login/device', { method: 'POST' });
      renderLoginStep(login);
      pollLogin(login.login_id).catch(function () {});
      return login;
    }

    function installModal() {
      if (modal) return modal;
      modal = document.createElement('div');
      modal.className = 'cy-gw-mask';
      modal.id = 'cy-gw-mask';
      modal.hidden = true;
      modal.innerHTML = '<section class="cy-gw-sheet" role="dialog" aria-modal="true" aria-labelledby="cy-gw-title">' +
        '<div class="cy-gw-head"><div><small>CY SUBSCRIPTION LINK</small><h3 id="cy-gw-title">接入 ChatGPT · Codex</h3></div><button class="cy-gw-close" type="button" aria-label="关闭">×</button></div>' +
        '<label class="cy-gw-field"><span>CY 网关地址</span><input id="cy-gw-endpoint" inputmode="url" placeholder="https://你的网关.example.com"></label>' +
        '<label class="cy-gw-field"><span>配对口令</span><input id="cy-gw-token" type="password" autocomplete="off" placeholder="CY 网关自己的口令，不是 OpenAI API Key"></label>' +
        '<label class="cy-gw-field"><span>Codex 模型</span><input id="cy-gw-model" placeholder="gpt-5.6-terra"></label>' +
        '<p class="cy-gw-hint">ChatGPT 登录只通过 OpenAI 官方设备码页面完成。CY 不收集你的 ChatGPT 密码，也不需要 OpenAI API Key。登录态只保存在你自己的网关服务器上。</p>' +
        '<div class="cy-gw-actions cy-gw-actions-three"><button id="cy-gw-test" type="button">测试网关</button><button id="cy-gw-login" type="button">登录 ChatGPT</button><button id="cy-gw-save" class="primary" type="button">打开聊天</button></div>' +
        '<div class="cy-gw-result" id="cy-gw-result">先连接网关，再登录 ChatGPT。</div>' +
        '</section>';
      document.body.appendChild(modal);
      modal.querySelector('.cy-gw-close').addEventListener('click', closeSetup);
      modal.addEventListener('click', function (event) { if (event.target === modal) closeSetup(); });
      modal.querySelector('#cy-gw-test').addEventListener('click', async function () {
        saveFields();
        try { await check(true); } catch (error) {}
      });
      modal.querySelector('#cy-gw-login').addEventListener('click', async function () {
        try { await startLogin(); } catch (error) { renderResult(null, error); }
      });
      modal.querySelector('#cy-gw-save').addEventListener('click', async function () {
        saveFields();
        await ensureProfile();
        var result = null;
        if (readSettings().endpoint) {
          try { result = await check(true); } catch (error) { return; }
          if (!result || !result.logged_in) {
            renderResult(result || {});
            return;
          }
        }
        closeSetup();
        await openChat();
      });
      return modal;
    }

    function saveFields() {
      var settings = {
        endpoint: tidyEndpoint(modal.querySelector('#cy-gw-endpoint').value),
        token: modal.querySelector('#cy-gw-token').value.trim(),
        model: modal.querySelector('#cy-gw-model').value.trim() || 'gpt-5.6-terra'
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return settings;
    }

    function openSetup() {
      installModal();
      var settings = readSettings();
      modal.querySelector('#cy-gw-endpoint').value = baseOf(settings.endpoint);
      modal.querySelector('#cy-gw-token').value = settings.token;
      modal.querySelector('#cy-gw-model').value = settings.model;
      modal.hidden = false;
      if (settings.endpoint) check(true).catch(function () {});
    }

    function closeSetup() {
      if (modal) modal.hidden = true;
    }

    function bind() {
      installFetchAdapter();
      installModal();
      (function ensureReady() {
        ensureProfile().then(function () {
          try { if (typeof renderFriends === 'function') renderFriends(); } catch (error) {}
        }).catch(function () { window.setTimeout(ensureReady, 180); });
      }());

      document.addEventListener('click', function (event) {
        var statusButton = event.target.closest && event.target.closest('#cy-status,.cy-paw-state');
        if (statusButton) openSetup();
      }, true);

      document.addEventListener('click', function (event) {
        var send = event.target.closest && event.target.closest('#cv-send');
        if (!send || typeof _activeCfg === 'undefined' || !_activeCfg || !_activeCfg.subscriptionGateway) return;
        var settings = readSettings();
        var ready = settings.endpoint && settings.token && state.detail && state.detail.logged_in;
        if (ready) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openSetup();
      }, true);

      if (readSettings().endpoint) check(false).catch(function () {});
      else paintState('local', '订阅未连接');
    }

    shell.gateway = {
      ensureProfile: ensureProfile,
      openChat: openChat,
      openSetup: openSetup,
      check: check,
      startLogin: startLogin,
      getState: function () { return Object.assign({}, state); }
    };
    bind();
  });
}());
