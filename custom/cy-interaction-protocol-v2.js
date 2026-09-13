(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__interactionProtocolV2Installed) return;
    shell.__interactionProtocolV2Installed = true;

    var PROCESSED_KEY = 'ibcy.paw.v2.processed.v1';
    var MARKER_RE = /\[\[CY_PAW\s+([^\]]{1,512})\]\]/g;
    var scanTimer = 0;
    var fetchPolls = 0;

    function readJson(key, fallback) {
      try {
        var parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed == null ? fallback : parsed;
      } catch (error) {
        return fallback;
      }
    }

    function writeJson(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
    }

    function lexicon() {
      try {
        if (shell.interactions && typeof shell.interactions.getLexicon === 'function') {
          return shell.interactions.getLexicon();
        }
      } catch (error) {}
      var actions = [];
      try {
        if (shell.paw && typeof shell.paw.getActions === 'function') actions = shell.paw.getActions();
      } catch (error) {}
      return { actions: Array.isArray(actions) ? actions : [], targets: [], counts: [1, 2, 3, 5] };
    }

    function runtimeText() {
      var current = lexicon();
      var actions = (current.actions || []).map(function (item) {
        return String(item.id || '') + '=' + String(item.label || '');
      }).filter(Boolean).join(', ');
      var targets = (current.targets || []).map(String).join(', ');
      var counts = (current.counts || []).map(function (value) { return '×' + Number(value); }).join(', ');
      return '[CY_MUTUAL_PAW]\n' +
        '这是 CY 当前实时、可编辑、双向共享的互动词库；它优先于任何更早的默认按钮列表。不要声称动作只能使用旧的默认六项，也不要声称用户刚编辑的动作或落点不可用。\n' +
        '当前动作（动作ID=显示文字）：' + (actions || '暂无') + '。\n' +
        '当前落点：' + (targets || '暂无') + '。\n' +
        '当前次数快捷项：' + (counts || '暂无') + '。明确要求的次数可在 1-99 内按要求使用。\n' +
        '你和莹莹共用这一份词库；她能对你使用，你也能用同一套动作对她使用。\n' +
        '若要主动触发互动，只在自然合适时于整段可见回复最后追加一个机器标记，格式必须是：[[CY_PAW action="动作ID" body_target="落点" count="次数"]]。body_target 没有落点时写空字符串。不要在可见回复里解释、复述或讨论这个机器标记。';
    }

    function cloneMessages(messages) {
      return (messages || []).map(function (message) {
        return Object.assign({}, message, {
          content: Array.isArray(message && message.content)
            ? message.content.map(function (part) { return Object.assign({}, part); })
            : message && message.content
        });
      });
    }

    function appendRuntimeToUser(message, runtime) {
      if (!message) return;
      var hidden = '\n\n[CY_INTERACTION_RUNTIME]\n' + runtime + '\n[/CY_INTERACTION_RUNTIME]';
      if (typeof message.content === 'string') {
        if (message.content.indexOf('[CY_INTERACTION_RUNTIME]') < 0) message.content += hidden;
        return;
      }
      if (Array.isArray(message.content)) {
        var textPart = null;
        for (var i = message.content.length - 1; i >= 0; i -= 1) {
          var part = message.content[i];
          if (part && (part.type === 'text' || part.type === 'input_text') && typeof part.text === 'string') {
            textPart = part;
            break;
          }
        }
        if (textPart) {
          if (textPart.text.indexOf('[CY_INTERACTION_RUNTIME]') < 0) textPart.text += hidden;
        } else {
          message.content.push({ type: 'text', text: hidden.trim() });
        }
      }
    }

    function addDynamicProtocol(body) {
      if (!body || !Array.isArray(body.messages)) return body;
      var runtime = runtimeText();
      var cloned = Object.assign({}, body, { messages: cloneMessages(body.messages) });
      var system = cloned.messages.find(function (message) {
        return message && message.role === 'system' && typeof message.content === 'string';
      });
      if (system) {
        var cut = system.content.indexOf('\n\n[CY_MUTUAL_PAW]');
        if (cut < 0) cut = system.content.indexOf('[CY_MUTUAL_PAW]');
        if (cut >= 0) system.content = system.content.slice(0, cut).trimEnd();
        system.content += '\n\n' + runtime;
      } else {
        cloned.messages.unshift({ role: 'system', content: runtime });
      }

      var lastUser = null;
      for (var i = cloned.messages.length - 1; i >= 0; i -= 1) {
        if (cloned.messages[i] && cloned.messages[i].role === 'user') {
          lastUser = cloned.messages[i];
          break;
        }
      }
      appendRuntimeToUser(lastUser, runtime);

      if (cloned.prompt_blocks && typeof cloned.prompt_blocks === 'object') {
        cloned.prompt_blocks = Object.assign({}, cloned.prompt_blocks, { interaction_protocol: runtime });
        var developer = String(cloned.prompt_blocks.developer || '');
        var oldCut = developer.indexOf('\n\n[CY_MUTUAL_PAW]');
        if (oldCut < 0) oldCut = developer.indexOf('[CY_MUTUAL_PAW]');
        if (oldCut >= 0) developer = developer.slice(0, oldCut).trimEnd();
        cloned.prompt_blocks.developer = developer + '\n\n' + runtime;
      }
      return cloned;
    }

    function wrapFetch() {
      var current = window.fetch;
      if (!current || current.__ibcyInteractionV2) return;
      var wrapped = async function (input, init) {
        try {
          var cfg = typeof _activeCfg !== 'undefined' ? _activeCfg : null;
          if (cfg && (cfg.subscriptionGateway || cfg.id === 'cy_codex_chen') && init && typeof init.body === 'string') {
            var body = JSON.parse(init.body);
            var next = addDynamicProtocol(body);
            init = Object.assign({}, init, { body: JSON.stringify(next) });
          }
        } catch (error) {}
        return current(input, init);
      };
      wrapped.__ibcyInteractionV2 = true;
      window.fetch = wrapped;
    }

    function keepFetchWrapped() {
      wrapFetch();
      fetchPolls += 1;
      if (fetchPolls < 16) window.setTimeout(keepFetchWrapped, 300);
    }

    function parseAttributes(text) {
      var attrs = {};
      var re = /([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g;
      var match;
      while ((match = re.exec(text))) attrs[match[1]] = match[2];
      return attrs;
    }

    function processed() {
      var map = readJson(PROCESSED_KEY, {});
      return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
    }

    function hasProcessed(key) {
      return Boolean(processed()[key]);
    }

    function markProcessed(key) {
      var map = processed();
      map[key] = Date.now();
      var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 160);
      var trimmed = {};
      keys.forEach(function (item) { trimmed[item] = map[item]; });
      writeJson(PROCESSED_KEY, trimmed);
    }

    function stripMarkerFromDom(message, commands, cleaned) {
      var bubble = document.querySelector('.m[data-id="' + message.id + '"]');
      if (!bubble) return;
      var text = bubble.querySelector('.m-text');
      if (!text) return;
      var walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var value = node.nodeValue;
        commands.forEach(function (command) { value = value.replace(command.raw, ''); });
        node.nodeValue = value;
      }
      if (!cleaned) {
        var row = bubble.closest('.mrow');
        if (row) row.classList.add('cy-paw-command-only');
      }
    }

    async function scanAssistantCommands() {
      var messages = [];
      try { messages = typeof _msgs !== 'undefined' && Array.isArray(_msgs) ? _msgs.slice() : []; } catch (error) {}
      for (var i = 0; i < messages.length; i += 1) {
        var message = messages[i];
        if (!message || message.interaction || String(message.role || '').toLowerCase() !== 'assistant' || typeof message.content !== 'string') continue;
        if (message.content.indexOf('CY_PAW') < 0 || message.content.indexOf('body_target=') < 0) continue;

        var commands = [];
        MARKER_RE.lastIndex = 0;
        var match;
        while ((match = MARKER_RE.exec(message.content))) {
          if (match[0].indexOf('body_target=') < 0) continue;
          var attrs = parseAttributes(match[1]);
          if (!attrs.action) continue;
          commands.push({
            raw: match[0],
            action: attrs.action,
            body_target: String(attrs.body_target || '').slice(0, 18),
            count: Math.max(1, Math.min(99, Math.round(Number(attrs.count) || 1)))
          });
        }
        if (!commands.length) continue;

        var cleaned = message.content;
        commands.forEach(function (command) { cleaned = cleaned.replace(command.raw, ''); });
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
        if (cleaned !== message.content) {
          message.content = cleaned;
          try { if (typeof dbPut === 'function') await dbPut('chatMessages', message); } catch (error) {}
          stripMarkerFromDom(message, commands, cleaned);
        }

        for (var j = 0; j < commands.length; j += 1) {
          var command = commands[j];
          var key = 'v2:' + String(message.id || '') + ':' + j + ':' + command.action + ':' + command.body_target + ':' + command.count;
          if (hasProcessed(key)) continue;
          markProcessed(key);
          try {
            if (shell.paw && typeof shell.paw.receiveInteraction === 'function') {
              await shell.paw.receiveInteraction({
                action: command.action,
                body_target: command.body_target,
                count: command.count
              });
            } else if (shell.paw && typeof shell.paw.receive === 'function') {
              var current = lexicon();
              var found = (current.actions || []).find(function (item) { return item.id === command.action; });
              var label = found ? found.label : command.action;
              var display = label + (command.body_target ? ' · ' + command.body_target : '');
              await shell.paw.receive(display, command.count, display);
            }
          } catch (error) {}
        }
      }
    }

    function scheduleScan() {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(function () { scanAssistantCommands().catch(function () {}); }, 420);
    }

    function observe() {
      var box = document.getElementById('cv-msgs');
      if (!box || !window.MutationObserver) {
        window.setTimeout(observe, 260);
        return;
      }
      new MutationObserver(scheduleScan).observe(box, { childList: true, subtree: true, characterData: true });
      scheduleScan();
    }

    window.addEventListener('ibcy:interaction-lexicon-change', function () {
      fetchPolls = 0;
      keepFetchWrapped();
    });

    keepFetchWrapped();
    observe();
    window.setInterval(scheduleScan, 1500);
  });
}());
