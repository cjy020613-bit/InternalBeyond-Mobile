(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__chatPolishInstalled) return;
    shell.__chatPolishInstalled = true;

    var SETTINGS_KEY = 'ibcy.gateway.settings.v1';
    var FALLBACK_TARGETS = ['手', '头发', '耳朵', '脸颊', '嘴', '颈窝', '肩膀', '胸口', '腰', '小腹'];
    var FALLBACK_COUNTS = [1, 2, 3, 5];
    var messageObserver = null;
    var scanTimer = 0;
    var selected = { actionId: '', actionLabel: '', target: '', count: 1 };
    var editorSection = '';
    var editorDraft = [];

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

    function actorOf(message) {
      var role = String(message && message.role || '').toLowerCase();
      if (role !== 'user' && role !== 'assistant') return '';
      var actor = role === 'user' ? 'yingying' : 'chen';
      if (message.interaction && message.interaction.actor === 'chen') actor = 'chen';
      if (message.interaction && message.interaction.actor === 'yingying') actor = 'yingying';
      return actor;
    }

    function decorateMessages() {
      var box = document.getElementById('cv-msgs');
      if (!box) return;
      var messages = roleMap();
      var entries = [];

      box.querySelectorAll('.m[data-id]').forEach(function (bubble) {
        var message = messages[String(bubble.getAttribute('data-id') || '')];
        if (!message) return;
        var actor = actorOf(message);
        if (!actor) return;
        var row = bubble.closest('.mrow');
        if (!row || row.classList.contains('cy-paw-command-only')) return;

        row.classList.add('cy-chat-identity-row');
        row.classList.toggle('cy-chat-from-yingying', actor === 'yingying');
        row.classList.toggle('cy-chat-from-chen', actor === 'chen');
        row.classList.toggle('cy-paw-from-yingying', actor === 'yingying' && row.classList.contains('cy-paw-event-row'));
        row.classList.toggle('cy-paw-from-chen', actor === 'chen' && row.classList.contains('cy-paw-event-row'));
        entries.push({ row: row, actor: actor });
      });

      var previousActor = '';
      entries.forEach(function (entry) {
        var row = entry.row;
        var actor = entry.actor;
        var startsTurn = actor !== previousActor;

        row.classList.toggle('cy-chat-turn-start', startsTurn);
        row.classList.toggle('cy-chat-turn-follow', !startsTurn);
        row.querySelectorAll(':scope > .cy-chat-avatar').forEach(function (node) { node.remove(); });

        var avatar = avatarNode(actor);
        if (!startsTurn) {
          avatar.classList.add('cy-chat-avatar-placeholder');
          avatar.setAttribute('aria-hidden', 'true');
          avatar.removeAttribute('aria-label');
        }
        if (actor === 'chen') row.insertBefore(avatar, row.firstChild);
        else row.appendChild(avatar);
        previousActor = actor;
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

    function fallbackLexicon() {
      var actions = [];
      try {
        if (shell.paw && typeof shell.paw.getActions === 'function') actions = shell.paw.getActions();
      } catch (error) {}
      return {
        actions: Array.isArray(actions) ? actions : [],
        targets: FALLBACK_TARGETS.slice(),
        counts: FALLBACK_COUNTS.slice()
      };
    }

    function getLexicon() {
      try {
        if (shell.interactions && typeof shell.interactions.getLexicon === 'function') return shell.interactions.getLexicon();
      } catch (error) {}
      return fallbackLexicon();
    }

    function saveLexicon(next) {
      try {
        if (shell.interactions && typeof shell.interactions.saveLexicon === 'function') return shell.interactions.saveLexicon(next);
      } catch (error) {}
      return next;
    }

    function ensureSelection(lexicon) {
      var actions = lexicon.actions || [];
      var targets = lexicon.targets || [];
      var counts = lexicon.counts || [];
      if (selected.actionId && !actions.some(function (item) { return item.id === selected.actionId; })) {
        selected.actionId = '';
        selected.actionLabel = '';
      }
      if (selected.target && targets.indexOf(selected.target) < 0) selected.target = '';
      if (counts.indexOf(Number(selected.count)) < 0) selected.count = counts.indexOf(1) >= 0 ? 1 : Number(counts[0] || 1);
    }

    function heading(title, section, id) {
      var wrap = document.createElement('div');
      wrap.className = 'cy-compose-heading';
      if (id) wrap.id = id;
      var label = document.createElement('small');
      label.textContent = title;
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'cy-compose-edit';
      edit.dataset.section = section;
      edit.textContent = '编辑';
      edit.addEventListener('click', function () { openEditor(section); });
      wrap.appendChild(label);
      wrap.appendChild(edit);
      return wrap;
    }

    function selectButton(group, value) {
      if (!group) return;
      group.querySelectorAll('button[data-value]').forEach(function (button) {
        button.classList.toggle('selected', String(button.dataset.value) === String(value));
      });
    }

    function renderActions(actionsEl, lexicon) {
      var oldHeading = document.getElementById('cy-compose-actions-heading');
      if (!oldHeading) {
        oldHeading = heading('动作', 'actions', 'cy-compose-actions-heading');
        actionsEl.parentNode.insertBefore(oldHeading, actionsEl);
      }
      actionsEl.textContent = '';
      (lexicon.actions || []).forEach(function (action) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'cy-compose-action';
        button.dataset.value = action.id;
        button.textContent = action.label;
        button.classList.toggle('selected', selected.actionId === action.id);
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          selected.actionId = action.id;
          selected.actionLabel = action.label;
          selectButton(actionsEl, action.id);
          updateConfirm();
        });
        actionsEl.appendChild(button);
      });
    }

    function buildChoiceGroup(title, section, className, values, key) {
      var block = document.createElement('section');
      block.className = 'cy-compose-group ' + className;
      block.appendChild(heading(title, section));
      var choices = document.createElement('div');
      choices.className = 'cy-compose-choices';
      values.forEach(function (value) {
        var button = document.createElement('button');
        button.type = 'button';
        button.dataset.value = String(value);
        button.textContent = key === 'count' ? '×' + value : String(value);
        button.classList.toggle('selected', String(selected[key]) === String(value));
        button.addEventListener('click', function () {
          selected[key] = key === 'count' ? Number(value) : String(value);
          selectButton(choices, value);
          updateConfirm();
        });
        choices.appendChild(button);
      });
      block.appendChild(choices);
      return block;
    }

    function updateConfirm() {
      var confirm = document.getElementById('cy-compose-confirm');
      if (!confirm) return;
      var parts = [];
      if (selected.actionLabel) parts.push(selected.actionLabel);
      if (selected.target) parts.push(selected.target);
      confirm.textContent = parts.length ? '就这一下 · ' + parts.join(' · ') + (selected.count > 1 ? ' ×' + selected.count : '') : '先选一个动作';
      confirm.disabled = !selected.actionId;
    }

    function draftFor(section, lexicon) {
      if (section === 'actions') return (lexicon.actions || []).map(function (item) { return { id: item.id, label: item.label }; });
      if (section === 'targets') return (lexicon.targets || []).slice();
      return (lexicon.counts || []).slice();
    }

    function moveDraft(index, delta) {
      var next = index + delta;
      if (next < 0 || next >= editorDraft.length) return;
      var item = editorDraft[index];
      editorDraft[index] = editorDraft[next];
      editorDraft[next] = item;
      renderEditor();
    }

    function renderEditor() {
      var editor = document.getElementById('cy-compose-editor');
      if (!editor || !editorSection) return;
      editor.hidden = false;
      editor.textContent = '';

      var title = document.createElement('div');
      title.className = 'cy-compose-editor-head';
      var titleText = document.createElement('b');
      titleText.textContent = editorSection === 'actions' ? '编辑动作' : editorSection === 'targets' ? '编辑落点' : '编辑次数';
      var close = document.createElement('button');
      close.type = 'button';
      close.textContent = '收起';
      close.addEventListener('click', closeEditor);
      title.appendChild(titleText);
      title.appendChild(close);
      editor.appendChild(title);

      var list = document.createElement('div');
      list.className = 'cy-compose-editor-list';
      editorDraft.forEach(function (item, index) {
        var row = document.createElement('div');
        row.className = 'cy-compose-editor-row';
        var input = document.createElement('input');
        input.type = editorSection === 'counts' ? 'number' : 'text';
        input.min = editorSection === 'counts' ? '1' : '';
        input.max = editorSection === 'counts' ? '99' : '';
        input.value = editorSection === 'actions' ? item.label : String(item);
        input.placeholder = editorSection === 'actions' ? '动作名称' : editorSection === 'targets' ? '落点名称' : '次数';
        input.addEventListener('input', function () {
          if (editorSection === 'actions') editorDraft[index].label = input.value;
          else if (editorSection === 'counts') editorDraft[index] = Number(input.value || 0);
          else editorDraft[index] = input.value;
        });

        var up = document.createElement('button');
        up.type = 'button';
        up.textContent = '↑';
        up.disabled = index === 0;
        up.addEventListener('click', function () { moveDraft(index, -1); });

        var down = document.createElement('button');
        down.type = 'button';
        down.textContent = '↓';
        down.disabled = index === editorDraft.length - 1;
        down.addEventListener('click', function () { moveDraft(index, 1); });

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'danger';
        remove.textContent = '删';
        remove.addEventListener('click', function () {
          editorDraft.splice(index, 1);
          renderEditor();
        });

        row.appendChild(input);
        row.appendChild(up);
        row.appendChild(down);
        row.appendChild(remove);
        list.appendChild(row);
      });
      editor.appendChild(list);

      var tools = document.createElement('div');
      tools.className = 'cy-compose-editor-tools';
      var add = document.createElement('button');
      add.type = 'button';
      add.textContent = '＋ 新增';
      add.addEventListener('click', function () {
        if (editorSection === 'actions') editorDraft.push({ id: 'custom-' + Date.now().toString(36), label: '' });
        else if (editorSection === 'counts') editorDraft.push(1);
        else editorDraft.push('');
        renderEditor();
        window.setTimeout(function () {
          var inputs = editor.querySelectorAll('input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 0);
      });

      var reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = '恢复默认';
      reset.addEventListener('click', function () {
        try {
          if (shell.interactions && typeof shell.interactions.resetSection === 'function') shell.interactions.resetSection(editorSection);
        } catch (error) {}
        closeEditor();
        renderComposer();
      });

      var done = document.createElement('button');
      done.type = 'button';
      done.className = 'primary';
      done.textContent = '完成';
      done.addEventListener('click', function () {
        var lexicon = getLexicon();
        if (editorSection === 'actions') lexicon.actions = editorDraft;
        if (editorSection === 'targets') lexicon.targets = editorDraft;
        if (editorSection === 'counts') lexicon.counts = editorDraft;
        saveLexicon(lexicon);
        closeEditor();
        renderComposer();
      });

      tools.appendChild(add);
      tools.appendChild(reset);
      tools.appendChild(done);
      editor.appendChild(tools);
    }

    function openEditor(section) {
      var lexicon = getLexicon();
      editorSection = section;
      editorDraft = draftFor(section, lexicon);
      renderEditor();
      var editor = document.getElementById('cy-compose-editor');
      if (editor && typeof editor.scrollIntoView === 'function') editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function closeEditor() {
      var editor = document.getElementById('cy-compose-editor');
      editorSection = '';
      editorDraft = [];
      if (editor) {
        editor.hidden = true;
        editor.textContent = '';
      }
    }

    function renderComposer() {
      var panel = document.getElementById('cy-paw-panel');
      var actions = document.getElementById('cy-paw-actions');
      if (!panel || !actions) return;

      var headTitle = panel.querySelector('.cy-paw-head b');
      if (headTitle) headTitle.textContent = '戳一戳';
      var intro = panel.querySelector(':scope > p');
      if (intro) intro.textContent = '动作、落点和次数都可以自己改；我和你共用这一份。';

      var lexicon = getLexicon();
      ensureSelection(lexicon);
      renderActions(actions, lexicon);

      var extra = document.getElementById('cy-compose-extra');
      if (!extra) {
        extra = document.createElement('div');
        extra.id = 'cy-compose-extra';
        extra.className = 'cy-compose-extra';
        var feedbackNode = document.getElementById('cy-paw-feedback');
        panel.insertBefore(extra, feedbackNode || panel.querySelector('.cy-paw-tools'));
      }
      extra.textContent = '';
      extra.appendChild(buildChoiceGroup('落在哪', 'targets', 'cy-compose-targets', lexicon.targets || [], 'target'));
      extra.appendChild(buildChoiceGroup('次数', 'counts', 'cy-compose-counts', lexicon.counts || [], 'count'));

      var editor = document.createElement('div');
      editor.id = 'cy-compose-editor';
      editor.className = 'cy-compose-editor';
      editor.hidden = true;
      extra.appendChild(editor);

      var confirm = document.createElement('button');
      confirm.id = 'cy-compose-confirm';
      confirm.className = 'cy-compose-confirm';
      confirm.type = 'button';
      confirm.addEventListener('click', function () {
        if (!selected.actionId || !shell.paw) return;
        var spec = {
          action: { id: selected.actionId, label: selected.actionLabel },
          body_target: selected.target,
          count: selected.count || 1
        };
        var sender;
        if (typeof shell.paw.sendInteraction === 'function') sender = shell.paw.sendInteraction(spec);
        else if (typeof shell.paw.sendBurst === 'function') sender = shell.paw.sendBurst(selected.actionLabel + (selected.target ? ' · ' + selected.target : ''), selected.count || 1);
        else return;
        confirm.disabled = true;
        Promise.resolve(sender).then(function () {
          var feedback = document.getElementById('cy-paw-feedback');
          var display = selected.actionLabel + (selected.target ? ' · ' + selected.target : '') + ((selected.count || 1) > 1 ? ' ×' + selected.count : '');
          if (feedback) {
            feedback.textContent = '已送进聊天 · ' + display;
            feedback.classList.add('show');
          }
          var close = document.getElementById('cy-paw-close');
          window.setTimeout(function () { if (close) close.click(); }, 220);
        }).catch(function () {
          confirm.disabled = false;
        });
      });
      extra.appendChild(confirm);
      updateConfirm();
    }

    function installComposer() {
      var panel = document.getElementById('cy-paw-panel');
      var actions = document.getElementById('cy-paw-actions');
      if (!panel || !actions) {
        window.setTimeout(installComposer, 220);
        return;
      }
      renderComposer();
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
    window.addEventListener('ibcy:interaction-lexicon-change', function () {
      closeEditor();
      renderComposer();
    });
    window.addEventListener('storage', function (event) {
      if (event.key === SETTINGS_KEY) refreshModelPill();
    });
    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('#cy-paw')) window.setTimeout(renderComposer, 30);
    });

    observeMessages();
    installComposer();
    installModelPill();
  });
}());
