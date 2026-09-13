(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__modelPickerInstalled) return;
    shell.__modelPickerInstalled = true;

    var SETTINGS_KEY = 'ibcy.gateway.settings.v1';
    var mask = null;
    var listNode = null;
    var statusNode = null;
    var refreshButton = null;
    var busy = false;

    function readSettings() {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (error) {}
      return Object.assign({ endpoint: '', token: '', model: 'gpt-5.6-terra' }, saved);
    }

    function writeSettings(next) {
      var current = readSettings();
      var merged = Object.assign({}, current, next || {});
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    }

    function baseOf(endpoint) {
      return String(endpoint || '').replace(/\/v1\/chat\/completions\/?$/i, '');
    }

    function esc(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function updatePill(model) {
      var value = String(model || readSettings().model || 'Codex 默认');
      var pill = document.getElementById('cy-model-pill');
      if (pill) pill.textContent = value + '  ▾';
    }

    function installSheet() {
      if (mask) return mask;
      mask = document.createElement('div');
      mask.id = 'cy-model-mask';
      mask.className = 'cy-model-mask';
      mask.hidden = true;
      mask.innerHTML = '<section class="cy-model-sheet" role="dialog" aria-modal="true" aria-labelledby="cy-model-title">' +
        '<div class="cy-model-handle" aria-hidden="true"></div>' +
        '<div class="cy-model-head"><div><small>CODEX MODELS</small><h3 id="cy-model-title">选择模型</h3></div><button class="cy-model-close" type="button" aria-label="关闭">×</button></div>' +
        '<p class="cy-model-sub">这里显示当前 ChatGPT / Codex 账号实际返回的可用模型。</p>' +
        '<div class="cy-model-status" id="cy-model-status">正在读取模型…</div>' +
        '<div class="cy-model-list" id="cy-model-list"></div>' +
        '<div class="cy-model-tools"><button id="cy-model-refresh" type="button">刷新模型列表</button><button id="cy-model-settings" type="button">订阅设置</button></div>' +
        '</section>';
      document.body.appendChild(mask);
      listNode = mask.querySelector('#cy-model-list');
      statusNode = mask.querySelector('#cy-model-status');
      refreshButton = mask.querySelector('#cy-model-refresh');

      mask.querySelector('.cy-model-close').addEventListener('click', close);
      mask.addEventListener('click', function (event) { if (event.target === mask) close(); });
      refreshButton.addEventListener('click', function () { refresh(true).catch(function () {}); });
      mask.querySelector('#cy-model-settings').addEventListener('click', function () {
        close();
        if (shell.gateway && typeof shell.gateway.openSetup === 'function') shell.gateway.openSetup();
      });
      listNode.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('button[data-model]');
        if (!button || busy) return;
        choose(button.dataset.model).catch(function (error) { showError(error); });
      });
      return mask;
    }

    function modelIds(payload) {
      var ids = [];
      var data = payload && Array.isArray(payload.data) ? payload.data : [];
      data.forEach(function (item) {
        var id = typeof item === 'string' ? item : item && (item.id || item.model || item.slug);
        id = String(id || '').trim();
        if (id && ids.indexOf(id) < 0) ids.push(id);
      });
      var current = String(readSettings().model || '').trim();
      if (current && ids.indexOf(current) < 0) ids.unshift(current);
      return ids;
    }

    async function fetchModels() {
      var settings = readSettings();
      if (!settings.endpoint || !settings.token) throw new Error('先把订阅网关连接好');
      var headers = { Accept: 'application/json', Authorization: 'Bearer ' + settings.token };
      var response = await window.fetch(baseOf(settings.endpoint) + '/v1/models', { cache: 'no-store', headers: headers });
      if (!response.ok) {
        var detail = await response.text().catch(function () { return ''; });
        throw new Error('模型列表读取失败，HTTP ' + response.status + (detail ? '：' + detail.slice(0, 120) : ''));
      }
      return modelIds(await response.json());
    }

    function render(models) {
      installSheet();
      var current = String(readSettings().model || '');
      listNode.textContent = '';
      if (!models.length) {
        statusNode.textContent = '当前账号没有返回可选模型。';
        return;
      }
      statusNode.textContent = '当前：' + (current || '未选择') + ' · 共 ' + models.length + ' 个';
      models.forEach(function (model) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'cy-model-option';
        button.dataset.model = model;
        button.classList.toggle('selected', model === current);
        button.innerHTML = '<span><b>' + esc(model) + '</b><small>' + (model === current ? '正在使用' : '点一下切换') + '</small></span><i aria-hidden="true">' + (model === current ? '✓' : '›') + '</i>';
        listNode.appendChild(button);
      });
    }

    function showError(error) {
      installSheet();
      statusNode.textContent = String(error && error.message || error || '模型列表读取失败');
      statusNode.classList.add('error');
    }

    async function refresh(force) {
      installSheet();
      if (busy && !force) return;
      busy = true;
      refreshButton.disabled = true;
      statusNode.classList.remove('error');
      statusNode.textContent = '正在读取当前账号可用模型…';
      try {
        var models = await fetchModels();
        render(models);
        return models;
      } catch (error) {
        showError(error);
        throw error;
      } finally {
        busy = false;
        refreshButton.disabled = false;
      }
    }

    async function choose(model) {
      model = String(model || '').trim();
      if (!model) return;
      busy = true;
      try {
        writeSettings({ model: model });
        var field = document.getElementById('cy-gw-model');
        if (field) field.value = model;
        try {
          if (typeof _activeCfg !== 'undefined' && _activeCfg && _activeCfg.subscriptionGateway) _activeCfg.model = model;
        } catch (error) {}
        try {
          if (typeof _cfgs !== 'undefined' && Array.isArray(_cfgs)) {
            _cfgs.forEach(function (cfg) { if (cfg && cfg.subscriptionGateway) cfg.model = model; });
          }
        } catch (error) {}
        if (shell.gateway && typeof shell.gateway.ensureProfile === 'function') await shell.gateway.ensureProfile();
        updatePill(model);
        window.dispatchEvent(new CustomEvent('ibcy:model-change', { detail: { model: model } }));
        try { if (typeof toast === 'function') toast('已切换到 ' + model); } catch (error) {}
        close();
      } finally {
        busy = false;
      }
    }

    function open() {
      installSheet();
      var settings = readSettings();
      if (!settings.endpoint || !settings.token) {
        if (shell.gateway && typeof shell.gateway.openSetup === 'function') shell.gateway.openSetup();
        return;
      }
      mask.hidden = false;
      updatePill(settings.model);
      refresh(false).catch(function () {});
    }

    function close() {
      if (mask) mask.hidden = true;
    }

    document.addEventListener('click', function (event) {
      var pill = event.target.closest && event.target.closest('#cy-model-pill');
      if (!pill) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    }, true);

    window.addEventListener('ibcy:gateway-status', function () { updatePill(); });
    window.addEventListener('ibcy:model-change', function (event) {
      updatePill(event && event.detail && event.detail.model);
    });

    shell.models = {
      open: open,
      close: close,
      refresh: refresh,
      set: choose,
      get: function () { return readSettings().model; }
    };

    updatePill();
  });
}());
