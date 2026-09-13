(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.register !== 'function') return;

  api.register('ob-bridge', function (shell) {
    var CONFIG_KEY = 'ibcy.ob.config.v1';
    var TOKEN_KEY = 'ibcy.ob.token.v1';
    var adapter = null;
    var state = {
      status: 'disabled',
      failures: 0,
      lastError: '',
      checkedAt: 0,
      retryAt: 0
    };

    function loadConfig() {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') || {}; } catch (error) {}
      return Object.assign({
        enabled: false,
        baseUrl: '',
        healthPath: '/health',
        timeoutMs: 8000,
        retryDelayMs: 30000
      }, saved);
    }

    var config = loadConfig();

    function cleanBaseUrl(value) {
      return String(value || '').trim().replace(/\/+$/, '');
    }

    function publicConfig() {
      return Object.assign({}, config, { hasToken: !!readToken() });
    }

    function readToken() {
      try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (error) { return ''; }
    }

    function emit() {
      var detail = Object.assign({}, state, { config: publicConfig() });
      window.dispatchEvent(new CustomEvent('ibcy:ob-status', { detail: detail }));
      return detail;
    }

    function setState(status, error) {
      state.status = status;
      state.checkedAt = Date.now();
      state.lastError = error ? String(error.message || error) : '';
      emit();
    }

    function configure(patch) {
      patch = patch || {};
      if (Object.prototype.hasOwnProperty.call(patch, 'token')) {
        try {
          if (patch.token) sessionStorage.setItem(TOKEN_KEY, String(patch.token));
          else sessionStorage.removeItem(TOKEN_KEY);
        } catch (error) {}
      }
      var next = Object.assign({}, config, patch);
      delete next.token;
      next.baseUrl = cleanBaseUrl(next.baseUrl);
      next.timeoutMs = Math.max(1000, Math.min(30000, Number(next.timeoutMs) || 8000));
      next.retryDelayMs = Math.max(5000, Math.min(300000, Number(next.retryDelayMs) || 30000));
      config = next;
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch (error) {}
      state.failures = 0;
      state.retryAt = 0;
      setState(config.enabled ? 'idle' : 'disabled');
      return publicConfig();
    }

    async function request(path, options) {
      options = options || {};
      if (!config.enabled) throw new Error('OB bridge is disabled');
      if (!config.baseUrl) throw new Error('OB address is empty');
      if (state.retryAt > Date.now() && !options.force) throw new Error('OB is cooling down');

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, config.timeoutMs);
      var headers = Object.assign({
        Accept: 'application/json',
        'X-IBCY-Client': 'InternalBeyond-Mobile'
      }, options.headers || {});
      var token = readToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

      try {
        setState('checking');
        var response = await fetch(config.baseUrl + '/' + String(path || '').replace(/^\/+/, ''), {
          method: options.method || 'GET',
          headers: headers,
          body: options.body,
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('OB returned HTTP ' + response.status);
        var type = response.headers.get('content-type') || '';
        var result = type.indexOf('application/json') >= 0 ? await response.json() : await response.text();
        state.failures = 0;
        state.retryAt = 0;
        setState('online');
        return result;
      } catch (error) {
        state.failures += 1;
        state.retryAt = Date.now() + config.retryDelayMs;
        setState(state.failures >= 3 ? 'offline' : 'degraded', error);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    async function test() {
      return request(config.healthPath, { force: true });
    }

    function useAdapter(nextAdapter) {
      adapter = nextAdapter && typeof nextAdapter === 'object' ? nextAdapter : null;
      window.dispatchEvent(new CustomEvent('ibcy:ob-adapter', { detail: { ready: !!adapter } }));
    }

    async function localMemories(query) {
      if (typeof window.dbGetAll !== 'function') return [];
      var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
      var list = await window.dbGetAll('memories');
      if (!words.length) return list;
      return list.filter(function (item) {
        var haystack = [item.title, item.summary, item.content, item.body, item.tags && item.tags.join(' ')]
          .filter(Boolean).join(' ').toLowerCase();
        return words.some(function (word) { return haystack.indexOf(word) >= 0; });
      });
    }

    async function search(query, options) {
      options = options || {};
      if (config.enabled && adapter && typeof adapter.search === 'function' && state.retryAt <= Date.now()) {
        try { return await adapter.search(query, options, request); } catch (error) {}
      }
      return localMemories(query);
    }

    async function remember(memory, options) {
      if (!config.enabled || !adapter || typeof adapter.remember !== 'function') {
        throw new Error('OB write adapter is not configured');
      }
      return adapter.remember(memory, options || {}, request);
    }

    shell.ob = {
      configure: configure,
      getConfig: publicConfig,
      getState: function () { return Object.assign({}, state); },
      request: request,
      test: test,
      useAdapter: useAdapter,
      search: search,
      remember: remember
    };

    setState(config.enabled ? 'idle' : 'disabled');
  });
}());
