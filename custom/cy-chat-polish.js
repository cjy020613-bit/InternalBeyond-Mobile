(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__chatPolishInstalled) return;
    shell.__chatPolishInstalled = true;

    var SETTINGS_KEY = 'ibcy.gateway.settings.v1';
    var TARGETS = ['手', '头发', '耳朵', '脸颊', '嘴', '颈窝', '肩膀', '胸口', '腰', '小腹'];
    var COUNTS = [1, 2, 3, 5];
    var messageObserver = null;
    var panelObserver = null;
    var scanTimer = 0;
    var selected = { action: '', target: '', count: 1 };

    function profile(actor) {
      try {
        if (shell.identity && typeof shell.identity.getProfile === 'function') return shell.identity.getProfile(actor);
      } catch (error) {}
      return actor === 'chen'
        ? { name: '澈', initial: '澈', avatar: '' }
        : { name: '莹莹', initial: '莹', avatar: '' };
    }

    function avatarNode(actor) {
      var p = profile(actor);
      var avatar = document.createElement('span');
      avatar.className = 'cy-chat-avatar';
      avatar.dataset.actor = actor;
      avatar.setAttribute('aria-label', (p.name || actor) + '头像');
      if (p.avatar) {
        var img = document.createElement('img');
        img.src = p.avatar;
        img.alt = '';
        avatar.appendChild(img);
      } else {
        var initial = document.createElement('span');
        initial.textContent = p.initial || (actor === 'chen' ? '澈' : '莹');
        avatar.appendChild(initial);
      }
      return avatar;
    }

    function roleMap() {
      var map = {};
      try {
        if (typeof _msgs !== 'undefined' && Array.isArray(_msgs)) {
          _msgs.forEach(function (message) {
            if (message && message.id) map[String(message.id)] = message;
          });
        }
      } catch (error) {}
      return map;
    }

    function decorateMessages() {
      var box = document.getElementById('cv-msgs');
      if (!box) return;
      var messages = roleMap();
      box.querySelectorAll('.m[data-id]').forEach(function (bubble) {
        var message = messages[String(bubble.getAttribute('data-id') || '')];
        if (!message) return;
        var role = String(message.role || '').toLowerCase();
        if (role !== 'user' && role !== 'assistant') return;
        var actor = role === 'user' ? 'yingying' : 'chen';
        if (message.interaction && message.interaction.actor === 'chen') actor = 'chen';
        if (message.interaction && message.interaction.actor === 'yingying') actor = 'yingying';
        var row = bubble.closest('.mrow');
        if (!row) return;

        row.classList.add('cy-chat-identity-row');
        row.classList.toggle('cy-chat-from-yingying', actor === 'yingying');
        row.classList.toggle('cy-chat-from-chen', actor === 'chen');
        row.classList.toggle('cy-paw-from-yingying', actor === 'yingying' && row.classList.contains('cy-paw-event-row'));
        row.classList.toggle('cy-paw-from-chen', actor === 'chen' && row.classList.contains('cy-paw-event-row'));

        row.querySelectorAll(':scope > .cy-chat-avatar').forEach(function (node) { node.remove(); });
        var avatar = avatarNode(actor);
        if (actor === 'chen') row.insertBefore(avatar, row.firstChild);
        else row.appendChild(avatar);
      });
    }

    function scheduleDecorate() {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(decorateMessages, 60);
    }

    function observeMessages() {
      var box = document.getElementById('cv-msgs');
      if (!box) {
        window.setTimeout(observeMessages, 220);
        return;
      }
      if (messageObserver) messageObserver.disconnect();
      messageObserver = new MutationObserver(scheduleDecorate);
      messageObserver.observe(box, { childList: true, subtree: true, characterData: true });
      decorateMessages();
    }

    function selectButton(group, value) {
      group.querySelectorAll('button').forEach(function (button) {
        button.classList.toggle('selected', String(button.dataset.value) === String(value));
      });
    }

    function buildChoiceGroup(title, className, values, key) {
      var section = document.createElement('section');
      section.className = 'cy-compose-group ' + className;
      var label = document.createElement('small');
      label.textContent = title;
      var choices = document.createElement('div');
      choices.className = 'cy-compose-choices';
      values.forEach(function (value) {
        var button = document.createElement('button');
        button.type = 'button';
        button.dataset.value = String(value);
        button.textContent = key === 'count' ? '×' + value : String(value);
        button.addEventListener('click', function () {
          selected[key] = key === 'count' ? Number(value) : String(value);
          selectButton(choices, value);
          updateConfirm();
        });
        choices.appendChild(button);
      });
      section.appendChild(label);
      section.appendChild(choices);
      return section;
    }

    function updateConfirm() {
      var confirm = document.getElementById('cy-compose-confirm');
      if (!confirm) return;
      var parts = [];
      if (selected.action) parts.push(selected.action);
      if (selected.target) parts.push(selected.target);
      confirm.textContent = parts.length ? '就这一下 · ' + parts.join(' · ') + (selected.count > 1 ? ' ×' + selected.count : '') : '先选一个动作';
      confirm.disabled = !selected.action;
    }

    function enhanceActionButtons(actions) {
      actions.querySelectorAll('button').forEach(function (button) {
        if (button.dataset.cyComposeReady === '1') return;
        button.dataset.cyComposeReady = '1';
        button.classList.remove('cy-paw-chip');
        button.classList.add('cy-compose-action');
        button.dataset.value = String(button.textContent || '').trim();
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          selected.action = String(button.dataset.value || '').trim();
          actions.querySelectorAll('.cy-compose-action').forEach(function (item) {
            item.classList.toggle('selected', item === button);
          });
          updateConfirm();
        });
      });
    }

    function installComposer() {
      var panel = document.getElementById('cy-paw-panel');
      var actions = document.getElementById('cy-paw-actions');
      if (!panel || !actions) {
        window.setTimeout(installComposer, 220);
        return;
      }

      var headTitle = panel.querySelector('.cy-paw-head b');
      if (headTitle) headTitle.textContent = '戳一戳';
      var intro = panel.querySelector(':scope > p');
      if (intro) intro.textContent = '选一个动作，再选落在哪里。';
      enhanceActionButtons(actions);

      if (!document.getElementById('cy-compose-extra')) {
        var extra = document.createElement('div');
        extra.id = 'cy-compose-extra';
        extra.className = 'cy-compose-extra';
        var targets = buildChoiceGroup('落在哪', 'cy-compose-targets', TARGETS, 'target');
        var counts = buildChoiceGroup('次数', 'cy-compose-counts', COUNTS, 'count');
        var confirm = document.createElement('button');
        confirm.id = 'cy-compose-confirm';
        confirm.className = 'cy-compose-confirm';
        confirm.type = 'button';
        confirm.disabled = true;
        confirm.textContent = '先选一个动作';
        confirm.addEventListener('click', function () {
          if (!selected.action || !shell.paw || typeof shell.paw.sendBurst !== 'function') return;
          var composed = selected.action + (selected.target ? ' · ' + selected.target : '');
          confirm.disabled = true;
          shell.paw.sendBurst(composed, selected.count || 1).then(function () {
            var feedback = document.getElementById('cy-paw-feedback');
            if (feedback) {
              feedback.textContent = '已送进聊天 · ' + composed + ((selected.count || 1) > 1 ? ' ×' + selected.count : '');
              feedback.classList.add('show');
            }
            var close = document.getElementById('cy-paw-close');
            window.setTimeout(function () { if (close) close.click(); }, 220);
          }).catch(function () {
            confirm.disabled = false;
          });
        });
        extra.appendChild(targets);
        extra.appendChild(counts);
        extra.appendChild(confirm);
        var feedbackNode = document.getElementById('cy-paw-feedback');
        panel.insertBefore(extra, feedbackNode || panel.querySelector('.cy-paw-tools'));
        selectButton(counts.querySelector('.cy-compose-choices'), 1);
      }

      if (panelObserver) panelObserver.disconnect();
      panelObserver = new MutationObserver(function () {
        enhanceActionButtons(actions);
      });
      panelObserver.observe(actions, { childList: true, subtree: true });
    }

    function readModel() {
      try {
        var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
        return String(saved.model || 'Codex 默认');
      } catch (error) {
        return 'Codex 默认';
      }
    }

    function refreshModelPill() {
      var pill = document.getElementById('cy-model-pill');
      if (!pill) return;
      pill.textContent = readModel() + '  ▾';
    }

    function installModelPill() {
      var composer = document.querySelector('#conv .cv-input');
      if (!composer) {
        window.setTimeout(installModelPill, 220);
        return;
      }
      if (document.getElementById('cy-model-pill')) {
        refreshModelPill();
        return;
      }
      var pill = document.createElement('button');
      pill.id = 'cy-model-pill';
      pill.type = 'button';
      pill.setAttribute('aria-label', '选择 Codex 模型');
      pill.addEventListener('click', function () {
        var gateway = document.getElementById('cy-status') || document.querySelector('.cy-paw-state');
        if (gateway) gateway.click();
      });
      composer.appendChild(pill);
      refreshModelPill();
    }

    window.addEventListener('ibcy:identity-change', scheduleDecorate);
    window.addEventListener('ibcy:gateway-status', refreshModelPill);
    window.addEventListener('storage', function (event) {
      if (event.key === SETTINGS_KEY) refreshModelPill();
    });
    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('#cy-paw')) window.setTimeout(installComposer, 30);
    });

    observeMessages();
    installComposer();
    installModelPill();
  });
}());
