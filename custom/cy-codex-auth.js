(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__codexAuthInstalled) return;
    shell.__codexAuthInstalled = true;

    var SETTINGS_KEY = 'ibcy.gateway.settings.v1';
    var DEFAULT_BASE = 'https://codex-gateway-production-f16b.up.railway.app';
    var DEFAULT_MODEL = 'gpt-5.6-terra';
    var pollTimer = 0;

    function baseOf(endpoint) {
      return String(endpoint || '').replace(/\/v1\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
    }

    function chatEndpoint(base) {
      var value = String(base || '').trim().replace(/\/+$/, '');
      return value ? value + '/v1/chat/completions' : '';
    }

    function readSettings() {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (error) {}
      if (!saved.endpoint) saved.endpoint = chatEndpoint(DEFAULT_BASE);
      if (!saved.model) saved.model = DEFAULT_MODEL;
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch (error) {}
      return saved;
    }

    function saveVisibleFields() {
      var modal = document.getElementById('cy-gw-mask');
      var saved = readSettings();
      if (!modal) return saved;
      var endpoint = modal.querySelector('#cy-gw-endpoint');
      var token = modal.querySelector('#cy-gw-token');
      var model = modal.querySelector('#cy-gw-model');
      if (endpoint) saved.endpoint = chatEndpoint(endpoint.value || DEFAULT_BASE);
      if (token) saved.token = token.value.trim();
      if (model) saved.model = model.value.trim() || DEFAULT_MODEL;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
      return saved;
    }

    async function request(path, options) {
      var settings = readSettings();
      if (!settings.token) throw new Error('先填写配对口令');
      var headers = Object.assign({ Accept: 'application/json' }, options && options.headers || {});
      headers.Authorization = 'Bearer ' + settings.token;
      var response = await fetch(baseOf(settings.endpoint) + path, Object.assign({ cache: 'no-store', headers: headers }, options || {}));
      var text = await response.text();
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (error) { data = { detail: text }; }
      if (!response.ok) throw new Error(String(data.detail || (data.error && data.error.message) || ('HTTP ' + response.status)));
      return data;
    }

    function resultBox() {
      var modal = document.getElementById('cy-gw-mask');
      return modal && modal.querySelector('#cy-gw-result');
    }

    function showResult(kind, html) {
      var box = resultBox();
      if (!box) return;
      box.className = 'cy-gw-result ' + (kind || '');
      box.innerHTML = html;
    }

    function dispatchStatus(status, text, detail) {
      window.dispatchEvent(new CustomEvent('ibcy:gateway-status', { detail: { status: status, text: text, detail: detail || null } }));
    }

    function accountLabel(data) {
      var account = data && data.account || {};
      return account.email || account.name || account.planType || account.plan_type || account.type || 'ChatGPT 已登录';
    }

    async function inspectStatus(show) {
      var data = await request('/v1/codex/status');
      if (data.logged_in) {
        dispatchStatus('online', 'Codex 已连接', data);
        if (show) showResult('online', '<b>ChatGPT / Codex 已连接</b><p>' + accountLabel(data) + '</p><small>模型：' + String(data.model || DEFAULT_MODEL) + '</small>');
      } else {
        dispatchStatus('local', '等待登录 ChatGPT', data);
        if (show) showResult('', '<b>还没有登录 ChatGPT</b><p>点下面的“登录 ChatGPT”，然后去 OpenAI 官方页面确认一次。</p>');
      }
      return data;
    }

    async function pollLogin(loginId) {
      window.clearTimeout(pollTimer);
      try {
        var state = await request('/v1/codex/login/device/' + encodeURIComponent(loginId));
        if (state.status === 'completed') {
          showResult('online', '<b>登录成功</b><p>正在连接 Codex…</p>');
          await inspectStatus(true);
          return;
        }
        if (state.status === 'failed' || state.status === 'cancelled') {
          throw new Error(state.error || '登录没有完成');
        }
        pollTimer = window.setTimeout(function () { pollLogin(loginId); }, 1800);
      } catch (error) {
        showResult('error', '<b>登录失败</b><p>' + String(error.message || error) + '</p>');
      }
    }

    async function beginLogin() {
      saveVisibleFields();
      showResult('', '<b>正在向 OpenAI 申请设备码…</b>');
      var data = await request('/v1/codex/login/device', { method: 'POST' });
      var url = String(data.verification_url || 'https://auth.openai.com/codex/device');
      var code = String(data.user_code || '');
      showResult('', '<b>登录 ChatGPT</b><p>打开 OpenAI 官方页面，把下面这串码填进去：</p>' +
        '<div class="cy-gw-device-code">' + code + '</div>' +
        '<button class="cy-gw-open-login" id="cy-gw-open-login" type="button">打开 OpenAI 登录页面</button>' +
        '<small class="cy-gw-device-wait">确认后这个页面会自动变成“已连接”。</small>');
      var open = document.getElementById('cy-gw-open-login');
      if (open) open.addEventListener('click', function () { window.open(url, '_blank', 'noopener,noreferrer'); });
      pollLogin(String(data.login_id || ''));
    }

    function enhanceModal() {
      var modal = document.getElementById('cy-gw-mask');
      if (!modal || modal.dataset.codexAuthReady === '1') return;
      modal.dataset.codexAuthReady = '1';
      var title = modal.querySelector('#cy-gw-title');
      if (title) title.textContent = '连接 ChatGPT / Codex';
      var endpoint = modal.querySelector('#cy-gw-endpoint');
      if (endpoint && !endpoint.value) endpoint.value = DEFAULT_BASE;
      var model = modal.querySelector('#cy-gw-model');
      if (model && !model.value) model.value = DEFAULT_MODEL;
      var hint = modal.querySelector('.cy-gw-hint');
      if (hint) hint.textContent = '这里不填写 OpenAI API Key。CY 只连接你自己的私有网关；ChatGPT 登录会在 OpenAI 官方页面完成。';
      var actions = modal.querySelector('.cy-gw-actions');
      if (actions && !document.getElementById('cy-gw-login')) {
        var login = document.createElement('button');
        login.id = 'cy-gw-login';
        login.type = 'button';
        login.className = 'primary cy-gw-login';
        login.textContent = '登录 ChatGPT';
        login.addEventListener('click', function () { beginLogin().catch(function (error) { showResult('error', '<b>无法开始登录</b><p>' + String(error.message || error) + '</p>'); }); });
        actions.parentNode.insertBefore(login, actions);
      }
    }

    function interceptButtons() {
      document.addEventListener('click', function (event) {
        var test = event.target.closest && event.target.closest('#cy-gw-test');
        if (test) {
          event.preventDefault();
          event.stopImmediatePropagation();
          saveVisibleFields();
          inspectStatus(true).catch(function (error) { showResult('error', '<b>连接失败</b><p>' + String(error.message || error) + '</p>'); });
          return;
        }
        var save = event.target.closest && event.target.closest('#cy-gw-save');
        if (save) {
          event.preventDefault();
          event.stopImmediatePropagation();
          saveVisibleFields();
          inspectStatus(true).then(function (data) {
            if (!data.logged_in) return;
            var modal = document.getElementById('cy-gw-mask');
            if (modal) modal.hidden = true;
            if (shell.gateway && typeof shell.gateway.openChat === 'function') shell.gateway.openChat().catch(function () {});
          }).catch(function (error) { showResult('error', '<b>连接失败</b><p>' + String(error.message || error) + '</p>'); });
        }
      }, true);
    }

    readSettings();
    enhanceModal();
    interceptButtons();
    var observer = new MutationObserver(enhanceModal);
    observer.observe(document.body, { childList: true, subtree: true });

    var settings = readSettings();
    if (settings.token) {
      window.setTimeout(function () { inspectStatus(false).catch(function () { dispatchStatus('offline', '网关暂时离线'); }); }, 400);
    } else {
      dispatchStatus('local', '等待配对');
    }

    shell.codexAuth = {
      beginLogin: beginLogin,
      inspectStatus: inspectStatus,
      base: DEFAULT_BASE
    };
  });
}());
