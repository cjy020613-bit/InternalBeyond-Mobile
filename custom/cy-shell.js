(function () {
  'use strict';

  var api = window.IBCY || {};
  var queue = [];
  var started = false;

  api.version = '0.5.0';
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
    if (!document.getElementById('cy-gateway-css')) {
      var gatewayCss = document.createElement('link');
      gatewayCss.id = 'cy-gateway-css';
      gatewayCss.rel = 'stylesheet';
      gatewayCss.href = './custom/cy-gateway.css?v=0.5.0';
      document.head.appendChild(gatewayCss);
    }
    if (!document.getElementById('cy-gateway-script')) {
      var gatewayScript = document.createElement('script');
      gatewayScript.id = 'cy-gateway-script';
      gatewayScript.src = './custom/cy-gateway.js?v=0.5.0';
      document.body.appendChild(gatewayScript);
    }
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
    var PAW_ACTIONS_KEY = 'ibcy.paw.actions.v1';
    var PAW_EVENTS_KEY = 'ibcy.paw.events.v1';
    var DEFAULT_PAW_ACTIONS = [
      { id: 'miss-you', label: '想你' },
      { id: 'kiss', label: '亲亲' },
      { id: 'hold-tight', label: '抱紧' },
      { id: 'call-dad', label: '叫爸爸' },
      { id: 'pet', label: '摸摸' },
      { id: 'tease-me', label: '欺负我' }
    ];

    function svgPaw() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="7.1" cy="7.1" rx="2.2" ry="2.8"/><ellipse cx="16.9" cy="7.1" rx="2.2" ry="2.8"/><ellipse cx="4.8" cy="12.1" rx="2" ry="2.5"/><ellipse cx="19.2" cy="12.1" rx="2" ry="2.5"/><path d="M7.2 17.1c0-3 2.1-5.3 4.8-5.3s4.8 2.3 4.8 5.3c0 2-1.7 3.2-4.8 3.2s-4.8-1.2-4.8-3.2z"/></svg>';
    }

    function copyActions(actions) {
      return actions.map(function (action) {
        return { id: String(action.id || ''), label: String(action.label || '') };
      });
    }

    function loadPawActions() {
      try {
        var saved = JSON.parse(localStorage.getItem(PAW_ACTIONS_KEY) || 'null');
        if (Array.isArray(saved) && saved.length) {
          return saved.filter(function (action) {
            return action && String(action.label || '').trim();
          }).slice(0, 12).map(function (action, index) {
            return {
              id: String(action.id || ('custom-' + index + '-' + Date.now())),
              label: String(action.label).trim().slice(0, 12)
            };
          });
        }
      } catch (error) {}
      return copyActions(DEFAULT_PAW_ACTIONS);
    }

    function savePawActions(actions) {
      try { localStorage.setItem(PAW_ACTIONS_KEY, JSON.stringify(actions)); } catch (error) {}
    }

    function readPawEvents() {
      try {
        var saved = JSON.parse(localStorage.getItem(PAW_EVENTS_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
      } catch (error) {
        return [];
      }
    }

    function pawUuid() {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
      } catch (error) {}
      return 'paw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    function recordPawEvent(action, context) {
      var idempotencyKey = pawUuid();
      var now = new Date();
      var detail = {
        id: idempotencyKey,
        type: 'interaction.paw',
        action: action.id,
        label: action.label,
        actor: 'yingying',
        target: 'chen',
        source: 'chat_input',
        identity_id: localStorage.getItem('ibcy.identity_id') || 'cy',
        thread_id: context && context.thread ? String(context.thread.id || '') : '',
        timestamp: now.toISOString(),
        created_at: now.toISOString(),
        idempotency_key: idempotencyKey
      };
      var events = readPawEvents();
      events.push(detail);
      try { localStorage.setItem(PAW_EVENTS_KEY, JSON.stringify(events.slice(-100))); } catch (error) {}
      window.dispatchEvent(new CustomEvent('ibcy:interaction', { detail: detail }));
      return detail;
    }

    function pawPrompt(detail) {
      return '[interaction.paw]\n' + JSON.stringify({
        type: detail.type,
        action: detail.action,
        label: detail.label,
        actor: detail.actor,
        target: detail.target,
        source: detail.source,
        idempotency_key: detail.idempotency_key
      });
    }

    function decoratePawMessage(message, root) {
      if (!message || !message.interaction || message.interaction.type !== 'interaction.paw') return;
      var host = root || document;
      var bubble = host.matches && host.matches('.m[data-id="' + message.id + '"]')
        ? host
        : host.querySelector && host.querySelector('.m[data-id="' + message.id + '"]');
      if (!bubble || bubble.classList.contains('cy-paw-event')) return;
      var row = bubble.closest('.mrow');
      var text = bubble.querySelector('.m-text');
      if (row) row.classList.add('cy-paw-event-row');
      bubble.classList.add('cy-paw-event');
      if (text) {
        text.textContent = '';
        var mark = document.createElement('span');
        mark.className = 'cy-paw-event-mark';
        mark.innerHTML = svgPaw();
        var actor = document.createElement('span');
        actor.className = 'cy-paw-event-actor';
        actor.textContent = '莹莹';
        var label = document.createElement('b');
        label.textContent = String(message.interaction.label || message.interaction.action || '碰了碰');
        mark.appendChild(actor);
        mark.appendChild(label);
        text.appendChild(mark);
      }
    }

    function decorateAllPawMessages() {
      try {
        if (typeof _msgs === 'undefined' || !Array.isArray(_msgs)) return;
        _msgs.forEach(function (message) { decoratePawMessage(message, document); });
      } catch (error) {}
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
        '<div class="cy-paw-head"><div><small>CY PAW</small><b>想碰爸爸哪里</b></div><button id="cy-paw-close" type="button" aria-label="关闭">×</button></div>' +
        '<p>点一下会记成我们的互动。动作名字和顺序都可以自己改。</p>' +
        '<div class="cy-paw-actions" id="cy-paw-actions"></div>' +
        '<div class="cy-paw-feedback" id="cy-paw-feedback" aria-live="polite"></div>' +
        '<div class="cy-paw-tools"><button id="cy-paw-edit" type="button">编辑动作</button><button id="cy-go-chat" type="button">回到聊天</button></div>' +
        '<section class="cy-paw-editor" id="cy-paw-editor" hidden>' +
          '<div class="cy-paw-editor-head"><b>编辑动作盘</b><span>最多 12 个</span></div>' +
          '<div class="cy-paw-editor-list" id="cy-paw-editor-list"></div>' +
          '<div class="cy-paw-editor-actions"><button id="cy-paw-add" type="button">添加</button><button id="cy-paw-reset" type="button">恢复默认</button></div>' +
          '<div class="cy-paw-editor-save"><button id="cy-paw-cancel" type="button">取消</button><button id="cy-paw-save" type="button">保存</button></div>' +
        '</section>' +
        '<div class="cy-paw-state"><i></i><span id="cy-paw-state-text">本地模式</span></div>';
      document.body.appendChild(panel);

      var paw = document.createElement('button');
      paw.id = 'cy-paw';
      paw.type = 'button';
      paw.setAttribute('aria-label', '打开 CY 快捷入口');
      paw.innerHTML = svgPaw() + '<span></span>';
      document.body.appendChild(paw);

      var actions = loadPawActions();
      var actionsEl = document.getElementById('cy-paw-actions');
      var editor = document.getElementById('cy-paw-editor');
      var editorList = document.getElementById('cy-paw-editor-list');
      var feedback = document.getElementById('cy-paw-feedback');
      var editDraft = [];
      var feedbackTimer = 0;
      var postQueue = Promise.resolve();
      var replyTimer = 0;
      var burstLabel = '';
      var burstCount = 0;
      var burstAt = 0;

      function makeId() {
        return 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      }

      function showFeedback(label, prefix) {
        window.clearTimeout(feedbackTimer);
        feedback.textContent = (prefix || '已记下') + ' · ' + label;
        feedback.classList.add('show');
        feedbackTimer = window.setTimeout(function () { feedback.classList.remove('show'); }, 1400);
      }

      function showTapFeedback(label) {
        var now = Date.now();
        if (burstLabel === label && now - burstAt < 1100) burstCount += 1;
        else { burstLabel = label; burstCount = 1; }
        burstAt = now;
        showFeedback(label + (burstCount > 1 ? ' ×' + burstCount : ''), '已送进聊天');
        paw.classList.remove('tapped');
        void paw.offsetWidth;
        paw.classList.add('tapped');
        window.setTimeout(function () { paw.classList.remove('tapped'); }, 180);
      }

      async function resolvePawContext() {
        var cfg = null;
        var thread = null;
        var conv = document.getElementById('conv');
        try {
          if (conv && conv.classList.contains('open') && typeof _activeCfg !== 'undefined' && _activeCfg && !_activeCfg._group) {
            cfg = _activeCfg;
            thread = typeof _activeThread !== 'undefined' ? _activeThread : null;
          }
        } catch (error) {}
        if (cfg) return { cfg: cfg, thread: thread };

        try {
          var list = typeof _cfgs !== 'undefined' && Array.isArray(_cfgs) ? _cfgs : [];
          var lastId = localStorage.getItem('ib_hb_lastconv') || '';
          cfg = list.find(function (item) {
            return item && !item.archived && typeof cfgName === 'function' && cfgName(item) === '澈';
          }) || list.find(function (item) {
            return item && !item.archived && String(item.id || '') === lastId;
          }) || list.find(function (item) { return item && !item.archived && !item._group; });
          if (cfg && typeof openConv === 'function') {
            await openConv(cfg, null);
            return { cfg: cfg, thread: null };
          }
        } catch (error) {}
        return null;
      }

      function schedulePawReply(context) {
        window.clearTimeout(replyTimer);
        replyTimer = window.setTimeout(function tryReply() {
          var cfg = context && context.cfg;
          if (!cfg || cfg._group || !cfg.apiKey) return;
          try {
            var currentThread = typeof _activeThread !== 'undefined' && _activeThread ? String(_activeThread.id || '') : '';
            var eventThread = context.thread ? String(context.thread.id || '') : '';
            if (typeof _activeCfg === 'undefined' || !_activeCfg || _activeCfg.id !== cfg.id || currentThread !== eventThread) return;
            if (typeof _sendKeys !== 'undefined' && typeof _keyOf === 'function' && _sendKeys.has(_keyOf(cfg.id, eventThread))) {
              replyTimer = window.setTimeout(tryReply, 700);
              return;
            }
            if (typeof genReply === 'function') genReply(cfg, { source: 'interaction.paw' });
          } catch (error) {}
        }, 700);
      }

      async function postPawAction(action) {
        var context = await resolvePawContext();
        var detail = recordPawEvent(action, context);
        if (!context || typeof dbPut !== 'function') {
          showFeedback(action.label, '已保存在本机');
          return detail;
        }

        var cfg = context.cfg;
        var message = {
          id: 'msg_' + Date.now() + '_paw_' + detail.idempotency_key.replace(/[^a-z0-9]/gi, '').slice(-10),
          role: 'user',
          content: pawPrompt(detail),
          friendId: cfg.id,
          timestamp: Date.now(),
          interaction: detail
        };
        if (context.thread) message.threadId = context.thread.id;
        await dbPut('chatMessages', message);

        try {
          if (typeof _presTouch === 'function') _presTouch();
          if (typeof _msgs !== 'undefined' && Array.isArray(_msgs) && typeof _activeCfg !== 'undefined' && _activeCfg && _activeCfg.id === cfg.id) {
            _msgs.push(message);
            var box = typeof convEl === 'function' ? convEl('cv-msgs') : document.getElementById('cv-msgs');
            if (box && typeof buildMsgEl === 'function') {
              var empty = box.querySelector('.empty');
              if (empty) empty.remove();
              var row = buildMsgEl(message, _msgs[_msgs.length - 2] || null);
              decoratePawMessage(message, row);
              box.appendChild(row);
              if (typeof _tmCollapseAll === 'function') _tmCollapseAll();
              if (typeof pinBottom === 'function') pinBottom();
            }
          }
          if (window.IBApps && typeof window.IBApps._emit === 'function') window.IBApps._emit('message', message);
        } catch (error) {}

        schedulePawReply(context);
        return detail;
      }

      function renderActions() {
        actionsEl.innerHTML = '';
        actions.forEach(function (action) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'cy-paw-chip';
          button.textContent = action.label;
          button.addEventListener('click', function () {
            showTapFeedback(action.label);
            postQueue = postQueue.then(function () { return postPawAction(action); }).catch(function () {
              showFeedback(action.label, '发送失败');
            });
          });
          actionsEl.appendChild(button);
        });
      }

      function readEditorDraft() {
        return Array.prototype.slice.call(editorList.querySelectorAll('.cy-paw-edit-row')).map(function (row) {
          var input = row.querySelector('input');
          return { id: row.dataset.id || makeId(), label: String(input ? input.value : '').trim().slice(0, 12) };
        }).filter(function (action) { return action.label; });
      }

      function renderEditor() {
        editorList.innerHTML = '';
        editDraft.forEach(function (action, index) {
          var row = document.createElement('div');
          row.className = 'cy-paw-edit-row';
          row.dataset.id = action.id;

          var input = document.createElement('input');
          input.type = 'text';
          input.maxLength = 12;
          input.value = action.label;
          input.setAttribute('aria-label', '动作名称');
          row.appendChild(input);

          [['↑', -1, '上移'], ['↓', 1, '下移']].forEach(function (item) {
            var move = document.createElement('button');
            move.type = 'button';
            move.textContent = item[0];
            move.setAttribute('aria-label', item[2]);
            move.disabled = index + item[1] < 0 || index + item[1] >= editDraft.length;
            move.addEventListener('click', function () {
              editDraft = readEditorDraft();
              var next = index + item[1];
              var current = editDraft.splice(index, 1)[0];
              editDraft.splice(next, 0, current);
              renderEditor();
            });
            row.appendChild(move);
          });

          var remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'danger';
          remove.textContent = '×';
          remove.setAttribute('aria-label', '删除');
          remove.addEventListener('click', function () {
            editDraft = readEditorDraft();
            editDraft.splice(index, 1);
            renderEditor();
          });
          row.appendChild(remove);
          editorList.appendChild(row);
        });
      }

      function setEditing(editing) {
        editor.hidden = !editing;
        actionsEl.hidden = editing;
        document.querySelector('.cy-paw-tools').hidden = editing;
        panel.classList.toggle('editing', editing);
        if (editing) {
          editDraft = copyActions(actions);
          renderEditor();
        }
      }

      function setOpen(open) {
        if (!open && !editor.hidden) setEditing(false);
        panel.classList.toggle('open', open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        paw.classList.toggle('open', open);
      }

      paw.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
      document.getElementById('cy-paw-close').addEventListener('click', function () { setEditing(false); setOpen(false); });
      document.getElementById('cy-go-chat').addEventListener('click', function () {
        if (shell.gateway && typeof shell.gateway.openChat === 'function') {
          shell.gateway.openChat().catch(function () {});
          setOpen(false);
          return;
        }
        var chat = document.querySelector('.dw-item[data-page="chat"]');
        if (chat) chat.click();
        setOpen(false);
      });
      document.getElementById('cy-paw-edit').addEventListener('click', function () { setEditing(true); });
      document.getElementById('cy-paw-cancel').addEventListener('click', function () { setEditing(false); });
      document.getElementById('cy-paw-add').addEventListener('click', function () {
        editDraft = readEditorDraft();
        if (editDraft.length >= 12) return;
        editDraft.push({ id: makeId(), label: '新动作' });
        renderEditor();
        var inputs = editorList.querySelectorAll('input');
        if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
      });
      document.getElementById('cy-paw-reset').addEventListener('click', function () {
        editDraft = copyActions(DEFAULT_PAW_ACTIONS);
        renderEditor();
      });
      document.getElementById('cy-paw-save').addEventListener('click', function () {
        var next = readEditorDraft();
        actions = next.length ? next : copyActions(DEFAULT_PAW_ACTIONS);
        savePawActions(actions);
        renderActions();
        setEditing(false);
        showFeedback('动作盘已保存');
      });
      panel.addEventListener('click', function (event) { event.stopPropagation(); });

      var conv = document.getElementById('conv');
      if (conv && window.MutationObserver) {
        var syncConversation = function () {
          document.body.classList.toggle('cy-conversation-open', conv.classList.contains('open'));
          if (!conv.classList.contains('open')) setOpen(false);
        };
        new MutationObserver(syncConversation).observe(conv, { attributes: true, attributeFilter: ['class'] });
        syncConversation();
      }

      var messageBox = document.getElementById('cv-msgs');
      if (messageBox && window.MutationObserver) {
        new MutationObserver(decorateAllPawMessages).observe(messageBox, { childList: true, subtree: true });
        decorateAllPawMessages();
      }

      renderActions();
      shell.paw = {
        getActions: function () { return copyActions(actions); },
        getEvents: function () { return readPawEvents().slice(); },
        send: function (action) {
          var found = actions.find(function (item) { return item.id === action || item.label === action; });
          return found ? postPawAction(found) : Promise.reject(new Error('未找到这个动作'));
        },
        resetActions: function () {
          actions = copyActions(DEFAULT_PAW_ACTIONS);
          savePawActions(actions);
          renderActions();
          return copyActions(actions);
        }
      };
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
    window.addEventListener('ibcy:gateway-status', function (event) {
      var detail = event.detail || {};
      statusText = detail.text || '订阅未连接';
      statusTone = detail.status || 'local';
      paintStatus();
    });
    readObState();
  });
}());
