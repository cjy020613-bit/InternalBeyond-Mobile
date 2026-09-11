(function () {
  'use strict';

  var api = window.IBCY || {};
  var queue = [];
  var started = false;

  api.version = '0.3.0';
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

    function recordPawEvent(action) {
      var detail = {
        id: 'paw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        type: 'interaction',
        source: 'cy-paw',
        action_id: action.id,
        label: action.label,
        identity_id: localStorage.getItem('ibcy.identity_id') || 'cy',
        thread_id: localStorage.getItem('ibcy.thread_id') || '',
        created_at: new Date().toISOString()
      };
      var events = readPawEvents();
      events.push(detail);
      try { localStorage.setItem(PAW_EVENTS_KEY, JSON.stringify(events.slice(-100))); } catch (error) {}
      window.dispatchEvent(new CustomEvent('ibcy:interaction', { detail: detail }));
      return detail;
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

      function makeId() {
        return 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      }

      function showFeedback(label) {
        window.clearTimeout(feedbackTimer);
        feedback.textContent = '已记下 · ' + label;
        feedback.classList.add('show');
        feedbackTimer = window.setTimeout(function () { feedback.classList.remove('show'); }, 1400);
      }

      function renderActions() {
        actionsEl.innerHTML = '';
        actions.forEach(function (action) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'cy-paw-chip';
          button.textContent = action.label;
          button.addEventListener('click', function () {
            recordPawEvent(action);
            showFeedback(action.label);
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

      renderActions();
      shell.paw = {
        getActions: function () { return copyActions(actions); },
        getEvents: function () { return readPawEvents().slice(); },
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
    readObState();
  });
}());
