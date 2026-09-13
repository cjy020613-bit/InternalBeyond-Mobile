(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__mutualPawInstalled) return;
    shell.__mutualPawInstalled = true;

    var EVENTS_KEY = 'ibcy.paw.events.v1';
    var PROCESSED_KEY = 'ibcy.paw.processed.v1';
    var MARKER_RE = /\[\[CY_PAW\s+action="([^"]{1,64})"(?:\s+label="([^"]{0,64})")?(?:\s+count="(\d{1,3})")?\s*\]\]/g;
    var pending = null;
    var scanTimer = 0;
    var fetchPolls = 0;

    function uuid() {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
      } catch (error) {}
      return 'paw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

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

    function readEvents() {
      var events = readJson(EVENTS_KEY, []);
      return Array.isArray(events) ? events : [];
    }

    function recordEvent(detail) {
      var events = readEvents();
      events.push(detail);
      writeJson(EVENTS_KEY, events.slice(-160));
      window.dispatchEvent(new CustomEvent('ibcy:interaction', { detail: detail }));
    }

    function clampCount(value) {
      var count = Math.round(Number(value) || 1);
      return Math.max(1, Math.min(99, count));
    }

    function getActions() {
      try {
        return shell.paw && typeof shell.paw.getActions === 'function' ? shell.paw.getActions() : [];
      } catch (error) {
        return [];
      }
    }

    function findAction(value, label) {
      var actions = getActions();
      var found = actions.find(function (item) {
        return item && (item.id === value || item.label === value || (label && item.label === label));
      });
      if (found) return { id: found.id, label: found.label };
      return { id: String(value || 'touch'), label: String(label || value || '碰了碰').slice(0, 18) };
    }

    async function resolveContext() {
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

    function makeDetail(action, actor, target, count, context, extra) {
      var now = new Date();
      var key = extra && extra.idempotency_key ? extra.idempotency_key : uuid();
      return {
        id: key,
        type: 'interaction.paw',
        action: action.id,
        label: action.label,
        count: clampCount(count),
        actor: actor,
        target: target,
        source: extra && extra.source ? extra.source : 'chat_button',
        source_message_id: extra && extra.source_message_id ? extra.source_message_id : '',
        identity_id: localStorage.getItem('ibcy.identity_id') || 'cy',
        thread_id: context && context.thread ? String(context.thread.id || '') : '',
        timestamp: now.toISOString(),
        created_at: now.toISOString(),
        idempotency_key: key
      };
    }

    function interactionPrompt(detail) {
      return '[interaction.paw]\n' + JSON.stringify({
        type: detail.type,
        action: detail.action,
        label: detail.label,
        count: detail.count,
        actor: detail.actor,
        target: detail.target,
        source: detail.source,
        idempotency_key: detail.idempotency_key
      });
    }

    function pawSvg() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="7.1" cy="7.1" rx="2.2" ry="2.8"/><ellipse cx="16.9" cy="7.1" rx="2.2" ry="2.8"/><ellipse cx="4.8" cy="12.1" rx="2" ry="2.5"/><ellipse cx="19.2" cy="12.1" rx="2" ry="2.5"/><path d="M7.2 17.1c0-3 2.1-5.3 4.8-5.3s4.8 2.3 4.8 5.3c0 2-1.7 3.2-4.8 3.2s-4.8-1.2-4.8-3.2z"/></svg>';
    }

    function decorateMessage(message, root) {
      if (!message || !message.interaction || message.interaction.type !== 'interaction.paw') return;
      var host = root || document;
      var bubble = host.matches && host.matches('.m[data-id="' + message.id + '"]')
        ? host
        : host.querySelector && host.querySelector('.m[data-id="' + message.id + '"]');
      if (!bubble) return;
      var detail = message.interaction;
      var row = bubble.closest('.mrow');
      var text = bubble.querySelector('.m-text');
      var fromChen = detail.actor === 'chen';
      if (row) {
        row.classList.add('cy-paw-event-row');
        row.classList.toggle('cy-paw-from-chen', fromChen);
        row.classList.toggle('cy-paw-from-yingying', !fromChen);
      }
      bubble.classList.add('cy-paw-event');
      bubble.dataset.actor = detail.actor || '';
      if (!text) return;
      text.textContent = '';
      var mark = document.createElement('span');
      mark.className = 'cy-paw-event-mark';
      if (fromChen) {
        var sparkle = document.createElement('span');
        sparkle.className = 'cy-paw-sparkle';
        sparkle.textContent = '✦';
        mark.appendChild(sparkle);
      } else {
        var icon = document.createElement('span');
        icon.className = 'cy-paw-mini';
        icon.innerHTML = pawSvg();
        mark.appendChild(icon);
      }
      var actor = document.createElement('span');
      actor.className = 'cy-paw-event-actor';
      actor.textContent = fromChen ? '澈' : '莹莹';
      var label = document.createElement('b');
      label.textContent = String(detail.label || detail.action || '碰了碰');
      mark.appendChild(actor);
      mark.appendChild(label);
      if (clampCount(detail.count) > 1) {
        var count = document.createElement('span');
        count.className = 'cy-paw-event-count';
        count.textContent = '×' + clampCount(detail.count);
        mark.appendChild(count);
      }
      text.appendChild(mark);
    }

    function activeMatches(context) {
      if (!context || !context.cfg) return false;
      try {
        var currentThread = typeof _activeThread !== 'undefined' && _activeThread ? String(_activeThread.id || '') : '';
        var eventThread = context.thread ? String(context.thread.id || '') : '';
        return typeof _activeCfg !== 'undefined' && _activeCfg && _activeCfg.id === context.cfg.id && currentThread === eventThread;
      } catch (error) {
        return false;
      }
    }

    async function appendInteraction(detail, role, context) {
      if (!context || !context.cfg || typeof dbPut !== 'function') {
        recordEvent(detail);
        return null;
      }
      var message = {
        id: 'msg_' + Date.now() + '_paw_' + String(detail.idempotency_key).replace(/[^a-z0-9]/gi, '').slice(-14),
        role: role,
        content: interactionPrompt(detail),
        friendId: context.cfg.id,
        timestamp: Date.now(),
        interaction: detail
      };
      if (context.thread) message.threadId = context.thread.id;
      recordEvent(detail);
      await dbPut('chatMessages', message);

      try {
        if (activeMatches(context) && typeof _msgs !== 'undefined' && Array.isArray(_msgs)) {
          _msgs.push(message);
          var box = typeof convEl === 'function' ? convEl('cv-msgs') : document.getElementById('cv-msgs');
          if (box && typeof buildMsgEl === 'function') {
            var empty = box.querySelector('.empty');
            if (empty) empty.remove();
            var row = buildMsgEl(message, _msgs[_msgs.length - 2] || null);
            decorateMessage(message, row);
            box.appendChild(row);
            if (typeof _tmCollapseAll === 'function') _tmCollapseAll();
            if (typeof pinBottom === 'function') pinBottom();
          }
        }
        if (window.IBApps && typeof window.IBApps._emit === 'function') window.IBApps._emit('message', message);
      } catch (error) {}
      return message;
    }

    function scheduleReply(context) {
      window.setTimeout(function tryReply() {
        if (!context || !context.cfg || context.cfg._group || !context.cfg.apiKey || !activeMatches(context)) return;
        try {
          var eventThread = context.thread ? String(context.thread.id || '') : '';
          if (typeof _sendKeys !== 'undefined' && typeof _keyOf === 'function' && _sendKeys.has(_keyOf(context.cfg.id, eventThread))) {
            window.setTimeout(tryReply, 650);
            return;
          }
          if (typeof genReply === 'function') genReply(context.cfg, { source: 'interaction.paw', mutual: true });
        } catch (error) {}
      }, 350);
    }

    function feedback(action, count) {
      var box = document.getElementById('cy-paw-feedback');
      if (box) {
        box.textContent = '已戳爸爸 · ' + action.label + (count > 1 ? ' ×' + count : '');
        box.classList.add('show');
      }
      var paw = document.getElementById('cy-paw');
      if (paw) {
        paw.classList.remove('tapped');
        void paw.offsetWidth;
        paw.classList.add('tapped');
        window.setTimeout(function () { paw.classList.remove('tapped'); }, 180);
      }
    }

    async function flushPending() {
      if (!pending) return;
      var current = pending;
      pending = null;
      window.clearTimeout(current.timer);
      var context = await resolveContext();
      var detail = makeDetail(current.action, 'yingying', 'chen', current.count, context, { source: 'chat_button' });
      await appendInteraction(detail, 'user', context);
      scheduleReply(context);
    }

    function queueUserAction(action) {
      var now = Date.now();
      if (pending && pending.action.id === action.id && now - pending.lastAt < 1000) {
        pending.count += 1;
        pending.lastAt = now;
        window.clearTimeout(pending.timer);
      } else {
        if (pending) flushPending().catch(function () {});
        pending = { action: action, count: 1, lastAt: now, timer: 0 };
      }
      feedback(action, pending.count);
      pending.timer = window.setTimeout(function () { flushPending().catch(function () {}); }, 720);
    }

    document.addEventListener('click', function (event) {
      var chip = event.target.closest && event.target.closest('.cy-paw-chip');
      if (!chip || !shell.paw) return;
      var action = findAction('', String(chip.textContent || '').trim());
      event.preventDefault();
      event.stopImmediatePropagation();
      queueUserAction(action);
    }, true);

    function processedMap() {
      var value = readJson(PROCESSED_KEY, {});
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function markProcessed(key) {
      var map = processedMap();
      map[key] = Date.now();
      var entries = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 120);
      var trimmed = {};
      entries.forEach(function (item) { trimmed[item] = map[item]; });
      writeJson(PROCESSED_KEY, trimmed);
    }

    function isProcessed(key) {
      return Boolean(processedMap()[key]);
    }

    function stripMarkerFromDom(message, cleaned) {
      var bubble = document.querySelector('.m[data-id="' + message.id + '"]');
      if (!bubble) return;
      var text = bubble.querySelector('.m-text');
      if (!text) return;
      var original = text.textContent || '';
      if (original.indexOf('CY_PAW') < 0) return;
      var walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      var node;
      var changed = false;
      while ((node = walker.nextNode())) {
        MARKER_RE.lastIndex = 0;
        var next = node.nodeValue.replace(MARKER_RE, '').trimEnd();
        if (next !== node.nodeValue) {
          node.nodeValue = next;
          changed = true;
        }
      }
      if (!changed && original.indexOf('CY_PAW') >= 0) text.textContent = cleaned;
      if (!cleaned) {
        var row = bubble.closest('.mrow');
        if (row) row.classList.add('cy-paw-command-only');
      }
    }

    async function receiveFromChen(actionValue, label, count, sourceMessageId, commandIndex) {
      var context = await resolveContext();
      var action = findAction(actionValue, label);
      var key = 'chen:' + String(sourceMessageId || 'manual') + ':' + String(commandIndex || 0) + ':' + action.id;
      if (isProcessed(key)) return null;
      markProcessed(key);
      var detail = makeDetail(action, 'chen', 'yingying', count, context, {
        source: 'assistant_action',
        source_message_id: String(sourceMessageId || ''),
        idempotency_key: key
      });
      return appendInteraction(detail, 'assistant', context);
    }

    async function scanAssistantCommands() {
      var messages;
      try { messages = typeof _msgs !== 'undefined' && Array.isArray(_msgs) ? _msgs.slice() : []; } catch (error) { messages = []; }
      for (var i = 0; i < messages.length; i += 1) {
        var message = messages[i];
        if (!message || message.interaction || String(message.role || '').toLowerCase() !== 'assistant' || typeof message.content !== 'string') continue;
        if (message.content.indexOf('CY_PAW') < 0) continue;
        var commands = [];
        MARKER_RE.lastIndex = 0;
        var match;
        while ((match = MARKER_RE.exec(message.content))) {
          commands.push({ raw: match[0], action: match[1], label: match[2] || '', count: clampCount(match[3] || 1) });
        }
        if (!commands.length) continue;
        var cleaned = message.content;
        commands.forEach(function (command) { cleaned = cleaned.replace(command.raw, ''); });
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
        if (cleaned !== message.content) {
          message.content = cleaned;
          try { if (typeof dbPut === 'function') await dbPut('chatMessages', message); } catch (error) {}
          stripMarkerFromDom(message, cleaned);
        }
        for (var j = 0; j < commands.length; j += 1) {
          await receiveFromChen(commands[j].action, commands[j].label, commands[j].count, message.id, j);
        }
      }
    }

    function scheduleScan() {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(function () { scanAssistantCommands().catch(function () {}); }, 520);
    }

    function observeMessages() {
      var box = document.getElementById('cv-msgs');
      if (!box || !window.MutationObserver) return;
      new MutationObserver(scheduleScan).observe(box, { childList: true, subtree: true, characterData: true });
      scheduleScan();
    }

    function protocolText() {
      var actions = getActions().map(function (item) { return item.id + '=' + item.label; }).join(', ');
      return '\n\n[CY_MUTUAL_PAW]\n你可以像莹莹一样主动触发互动按钮。仅在自然、合适的时候使用，不要每条回复都触发。若要触发，在整段回复最后单独追加一个标记：[[CY_PAW action="动作ID" label="动作文字" count="1"]]。可用动作：' + actions + '。count 为 1-99；连续想做多次时直接写次数。不要解释这个标记，也不要把标记放进代码块。';
    }

    function addProtocol(body) {
      if (!body || !Array.isArray(body.messages)) return body;
      var already = body.messages.some(function (message) {
        return message && typeof message.content === 'string' && message.content.indexOf('[CY_MUTUAL_PAW]') >= 0;
      });
      if (already) return body;
      var cloned = Object.assign({}, body, { messages: body.messages.map(function (message) { return Object.assign({}, message); }) });
      var firstSystem = cloned.messages.find(function (message) { return message && message.role === 'system' && typeof message.content === 'string'; });
      if (firstSystem) firstSystem.content += protocolText();
      else cloned.messages.unshift({ role: 'system', content: protocolText().trim() });
      return cloned;
    }

    function wrapFetch() {
      var current = window.fetch;
      if (!current || current.__ibcyMutualPaw) return;
      var wrapped = async function (input, init) {
        try {
          var cfg = typeof _activeCfg !== 'undefined' ? _activeCfg : null;
          if (cfg && (cfg.subscriptionGateway || cfg.id === 'cy_codex_chen') && init && typeof init.body === 'string') {
            var body = JSON.parse(init.body);
            var next = addProtocol(body);
            if (next !== body) init = Object.assign({}, init, { body: JSON.stringify(next) });
          }
        } catch (error) {}
        return current(input, init);
      };
      wrapped.__ibcyMutualPaw = true;
      window.fetch = wrapped;
    }

    function keepFetchWrapped() {
      wrapFetch();
      fetchPolls += 1;
      if (fetchPolls < 12) window.setTimeout(keepFetchWrapped, 350);
    }

    shell.paw = shell.paw || {};
    shell.paw.sendBurst = function (actionValue, count) {
      var action = findAction(actionValue);
      return resolveContext().then(function (context) {
        var detail = makeDetail(action, 'yingying', 'chen', count, context, { source: 'api' });
        return appendInteraction(detail, 'user', context).then(function (message) {
          scheduleReply(context);
          return message;
        });
      });
    };
    shell.paw.receive = function (actionValue, count, label) {
      return receiveFromChen(actionValue, label || '', count || 1, 'manual-' + Date.now(), 0);
    };

    observeMessages();
    keepFetchWrapped();
    window.setInterval(scheduleScan, 1800);
  });
}());
