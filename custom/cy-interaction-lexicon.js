(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__interactionLexiconInstalled) return;
    shell.__interactionLexiconInstalled = true;

    var KEY = 'ibcy.interaction.lexicon.v1';
    var EVENTS_KEY = 'ibcy.paw.events.v1';
    var FALLBACK_ACTIONS = [
      { id: 'miss-you', label: '想你' },
      { id: 'kiss', label: '亲亲' },
      { id: 'hold-tight', label: '抱紧' },
      { id: 'call-dad', label: '叫爸爸' },
      { id: 'pet', label: '摸摸' },
      { id: 'tease-me', label: '欺负我' }
    ];
    var DEFAULT_TARGETS = ['手', '头发', '耳朵', '脸颊', '嘴', '颈窝', '肩膀', '胸口', '腰', '小腹'];
    var DEFAULT_COUNTS = [1, 2, 3, 5];

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function slug(label, index) {
      var ascii = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return ascii || ('custom-' + Date.now().toString(36) + '-' + String(index || 0));
    }

    function currentLegacyActions() {
      try {
        if (shell.paw && typeof shell.paw.getActions === 'function') {
          var actions = shell.paw.getActions();
          if (Array.isArray(actions) && actions.length) return actions;
        }
      } catch (error) {}
      return FALLBACK_ACTIONS;
    }

    function sanitizeActions(actions) {
      var seen = {};
      return (Array.isArray(actions) ? actions : []).map(function (item, index) {
        var label = String(item && item.label != null ? item.label : item || '').trim().slice(0, 18);
        if (!label) return null;
        var id = String(item && item.id || slug(label, index)).trim().slice(0, 48) || slug(label, index);
        if (seen[id]) id += '-' + index;
        seen[id] = true;
        return { id: id, label: label };
      }).filter(Boolean).slice(0, 24);
    }

    function sanitizeTargets(targets) {
      var seen = {};
      return (Array.isArray(targets) ? targets : []).map(function (value) {
        return String(value == null ? '' : value).trim().slice(0, 18);
      }).filter(function (value) {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      }).slice(0, 36);
    }

    function sanitizeCounts(counts) {
      var seen = {};
      return (Array.isArray(counts) ? counts : []).map(function (value) {
        return Math.max(1, Math.min(99, Math.round(Number(value) || 0)));
      }).filter(function (value) {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      }).slice(0, 16).sort(function (a, b) { return a - b; });
    }

    function defaults() {
      return {
        version: 1,
        actions: sanitizeActions(currentLegacyActions()),
        targets: DEFAULT_TARGETS.slice(),
        counts: DEFAULT_COUNTS.slice()
      };
    }

    function sanitize(value) {
      var base = defaults();
      var next = value && typeof value === 'object' ? value : {};
      var actions = sanitizeActions(next.actions);
      var targets = sanitizeTargets(next.targets);
      var counts = sanitizeCounts(next.counts);
      return {
        version: 1,
        actions: actions.length ? actions : base.actions,
        targets: targets.length ? targets : base.targets,
        counts: counts.length ? counts : base.counts
      };
    }

    function read() {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) return sanitize(JSON.parse(raw));
      } catch (error) {}
      var initial = defaults();
      try { localStorage.setItem(KEY, JSON.stringify(initial)); } catch (error) {}
      return initial;
    }

    function emit(next) {
      window.dispatchEvent(new CustomEvent('ibcy:interaction-lexicon-change', { detail: clone(next) }));
    }

    function save(next) {
      var clean = sanitize(next);
      try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (error) {}
      emit(clean);
      return clone(clean);
    }

    function resetSection(section) {
      var next = read();
      if (section === 'actions') next.actions = sanitizeActions(currentLegacyActions());
      if (section === 'targets') next.targets = DEFAULT_TARGETS.slice();
      if (section === 'counts') next.counts = DEFAULT_COUNTS.slice();
      return save(next);
    }

    function actionFrom(value) {
      var lexicon = read();
      var wanted = String(value && value.id || value && value.label || value || '').trim();
      var found = lexicon.actions.find(function (item) {
        return item.id === wanted || item.label === wanted;
      });
      if (found) return clone(found);
      var label = String(value && value.label || value || '碰了碰').trim().slice(0, 18) || '碰了碰';
      return { id: slug(label, lexicon.actions.length), label: label };
    }

    function updateRecordedEvent(detail) {
      if (!detail || !detail.idempotency_key) return;
      try {
        var events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
        if (!Array.isArray(events)) return;
        for (var i = events.length - 1; i >= 0; i -= 1) {
          if (events[i] && events[i].idempotency_key === detail.idempotency_key) {
            events[i] = Object.assign({}, events[i], detail);
            break;
          }
        }
        localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-160)));
      } catch (error) {}
    }

    function patchMessage(message, spec) {
      if (!message || !message.interaction) return message;
      var action = actionFrom(spec.action);
      var bodyTarget = String(spec.body_target || spec.target_part || '').trim().slice(0, 18);
      var count = Math.max(1, Math.min(99, Math.round(Number(spec.count) || 1)));
      var detail = message.interaction;
      detail.action = action.id;
      detail.action_label = action.label;
      detail.body_target = bodyTarget;
      detail.count = count;
      detail.label = action.label + (bodyTarget ? ' · ' + bodyTarget : '');
      message.content = '[interaction.paw]\n' + JSON.stringify({
        type: detail.type,
        action: detail.action,
        action_label: detail.action_label,
        body_target: detail.body_target,
        label: detail.label,
        count: detail.count,
        actor: detail.actor,
        target: detail.target,
        source: detail.source,
        idempotency_key: detail.idempotency_key
      });
      updateRecordedEvent(detail);
      try {
        if (typeof dbPut === 'function') dbPut('chatMessages', message).catch(function () {});
      } catch (error) {}
      window.dispatchEvent(new CustomEvent('ibcy:interaction-structured', { detail: clone(detail) }));
      return message;
    }

    shell.interactions = {
      getLexicon: function () { return clone(read()); },
      saveLexicon: function (next) { return save(next); },
      resetSection: resetSection,
      getAction: actionFrom,
      storageKey: KEY
    };

    shell.paw = shell.paw || {};
    shell.paw.lexicon = shell.interactions;

    var legacySendBurst = typeof shell.paw.sendBurst === 'function' ? shell.paw.sendBurst.bind(shell.paw) : null;
    var legacyReceive = typeof shell.paw.receive === 'function' ? shell.paw.receive.bind(shell.paw) : null;

    shell.paw.sendInteraction = function (spec) {
      spec = spec || {};
      if (!legacySendBurst) return Promise.reject(new Error('互动发送器还没准备好'));
      var action = actionFrom(spec.action);
      var bodyTarget = String(spec.body_target || '').trim().slice(0, 18);
      var display = action.label + (bodyTarget ? ' · ' + bodyTarget : '');
      var count = Math.max(1, Math.min(99, Math.round(Number(spec.count) || 1)));
      return legacySendBurst(display, count).then(function (message) {
        return patchMessage(message, { action: action, body_target: bodyTarget, count: count });
      });
    };

    shell.paw.receiveInteraction = function (spec) {
      spec = spec || {};
      if (!legacyReceive) return Promise.reject(new Error('互动接收器还没准备好'));
      var action = actionFrom(spec.action);
      var bodyTarget = String(spec.body_target || '').trim().slice(0, 18);
      var display = action.label + (bodyTarget ? ' · ' + bodyTarget : '');
      var count = Math.max(1, Math.min(99, Math.round(Number(spec.count) || 1)));
      return legacyReceive(display, count, display).then(function (message) {
        return patchMessage(message, { action: action, body_target: bodyTarget, count: count });
      });
    };

    shell.paw.sharedChoices = function () { return clone(read()); };

    window.addEventListener('storage', function (event) {
      if (event.key === KEY) emit(read());
    });
  });
}());
