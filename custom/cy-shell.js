(function () {
  'use strict';

  var api = window.IBCY || {};
  var queue = [];
  var started = false;

  api.version = '0.2.0';
  api.register = function (name, initializer) {
    if (typeof initializer !== 'function') return;
    var module = { name: String(name || 'anonymous'), initializer: initializer };
    if (started) run(module);
    else queue.push(module);
  };

  function run(module) {
    try {
      module.initializer(api);
    } catch (error) {
      console.error('[IBCY] module failed:', module.name, error);
    }
  }

  function boot() {
    if (started) return;
    started = true;
    document.documentElement.setAttribute('data-cy-shell', 'ready');
    document.documentElement.setAttribute('data-cy-version', api.version);
    while (queue.length) run(queue.shift());
    window.dispatchEvent(new CustomEvent('ibcy:ready', { detail: { version: api.version } }));
  }

  api.ready = function (callback) {
    if (typeof callback !== 'function') return;
    if (started) callback(api);
    else window.addEventListener('ibcy:ready', function () { callback(api); }, { once: true });
  };

  window.IBCY = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());

(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.register !== 'function') return;

  api.register('visual-shell', function (shell) {
    var statusText = '本地模式';
    var statusTone = 'local';

    function svgPaw() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="7.1" cy="7.1" rx="2.2" ry="2.8"/><ellipse cx="16.9" cy="7.1" rx="2.2" ry="2.8"/><ellipse cx="4.8" cy="12.1" rx="2" ry="2.5"/><ellipse cx="19.2" cy="12.1" rx="2" ry="2.5"/><path d="M7.2 17.1c0-3 2.1-5.3 4.8-5.3s4.8 2.3 4.8 5.3c0 2-1.7 3.2-4.8 3.2s-4.8-1.2-4.8-3.2z"/></svg>';
    }

    function installMeta() {
      document.title = 'CY · Mobile';
      ['application-name', 'apple-mobile-web-app-title'].forEach(function (name) {
        var meta = document.querySelector('meta[name="' + name + '"]');
        if (meta) meta.setAttribute('content', 'CY');
      });
    }

    function installTopSign() {
      var topbar = document.getElementById('topbar');
      var title = document.getElementById('tb-title');
      if (!topbar || !title || document.getElementById('cy-top-sign')) return;
      var sign = document.createElement('div');
      sign.id = 'cy-top-sign';
      sign.innerHTML = '<span>CY</span><i></i>';
      topbar.insertBefore(sign, title);
    }

    function installChatHero() {
      var section = document.getElementById('sec-chat-list');
      var list = document.getElementById('friend-list');
      if (!section || !list || document.getElementById('cy-chat-hero')) return;

      var hero = document.createElement('section');
      hero.id = 'cy-chat-hero';
      hero.className = 'cy-chat-hero';
      var hour = Number(new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        hour12: false
      }).format(new Date()).replace(/\D/g, ''));
      var greeting = hour < 5 ? '还没睡呀' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : hour < 22 ? '晚上好' : '夜里好';

      hero.innerHTML =
        '<div class="cy-hero-orb"><span>澈</span><i></i></div>' +
        '<div class="cy-hero-copy">' +
          '<small>CY PRIVATE LINK</small>' +
          '<h2>' + greeting + '，莹莹</h2>' +
          '<p>聊天、记忆和我们的日常，都从这里继续。</p>' +
        '</div>' +
        '<button class="cy-status" id="cy-status" type="button"><i></i><span>本地模式</span></button>';
      section.insertBefore(hero, list);
    }

    function installPaw() {
      if (document.getElementById('cy-paw')) return;

      var panel = document.createElement('div');
      panel.id = 'cy-paw-panel';
      panel.setAttribute('aria-hidden', 'true');
      panel.innerHTML =
        '<div class="cy-paw-head"><div><small>CY QUICK LINK</small><b>澈在这里</b></div><button id="cy-paw-close" type="button" aria-label="关闭">×</button></div>' +
        '<p>先把最常用的入口放在手边。OB 接好以后，这里会显示真实连接状态。</p>' +
        '<button class="cy-paw-action" id="cy-go-chat" type="button"><span>回到聊天</span><b>›</b></button>' +
        '<div class="cy-paw-state"><i></i><span id="cy-paw-state-text">本地模式</span></div>';
      document.body.appendChild(panel);

      var paw = document.createElement('button');
      paw.id = 'cy-paw';
      paw.type = 'button';
      paw.setAttribute('aria-label', '打开 CY 快捷入口');
      paw.innerHTML = svgPaw() + '<span></span>';
      document.body.appendChild(paw);

      function setOpen(open) {
        panel.classList.toggle('open', open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        paw.classList.toggle('open', open);
      }

      paw.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
      document.getElementById('cy-paw-close').addEventListener('click', function () { setOpen(false); });
      document.getElementById('cy-go-chat').addEventListener('click', function () {
        var chat = document.querySelector('.dw-item[data-page="chat"]');
        if (chat) chat.click();
        setOpen(false);
      });
      panel.addEventListener('click', function (event) { event.stopPropagation(); });

      var conv = document.getElementById('conv');
      if (conv && window.MutationObserver) {
        var syncConversation = function () {
          document.body.classList.toggle('cy-conversation-open', conv.classList.contains('open'));
          if (conv.classList.contains('open')) setOpen(false);
        };
        new MutationObserver(syncConversation).observe(conv, { attributes: true, attributeFilter: ['class'] });
        syncConversation();
      }
    }

    function paintStatus() {
      var hero = document.getElementById('cy-status');
      var pawState = document.getElementById('cy-paw-state-text');
      if (hero) {
        hero.dataset.tone = statusTone;
        var label = hero.querySelector('span');
        if (label) label.textContent = statusText;
      }
      if (pawState) pawState.textContent = statusText;
    }

    function readObState(detail) {
      var state = detail || (shell.ob && shell.ob.getState ? shell.ob.getState() : null) || {};
      if (state.status === 'online') {
        statusText = 'OB 已连接';
        statusTone = 'online';
      } else if (state.status === 'checking') {
        statusText = '正在连接 OB';
        statusTone = 'checking';
      } else if (state.status === 'degraded' || state.status === 'offline') {
        statusText = 'OB 暂时离线';
        statusTone = 'offline';
      } else {
        statusText = '本地模式';
        statusTone = 'local';
      }
      paintStatus();
    }

    installMeta();
    installTopSign();
    installChatHero();
    installPaw();
    window.addEventListener('ibcy:ob-status', function (event) { readObState(event.detail); });
    readObState();
  });
}());
