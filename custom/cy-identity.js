(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__identityInstalled) return;
    shell.__identityInstalled = true;

    var STORAGE_KEY = 'ibcy.identity.profiles.v1';
    var defaults = {
      yingying: { id: 'yingying', name: '莹莹', initial: '莹', avatar: '' },
      chen: { id: 'chen', name: '澈', initial: '澈', avatar: '' }
    };
    var modal = null;
    var activeActor = '';
    var observer = null;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function readProfiles() {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (error) {}
      var result = clone(defaults);
      ['yingying', 'chen'].forEach(function (actor) {
        if (!saved[actor] || typeof saved[actor] !== 'object') return;
        result[actor].avatar = typeof saved[actor].avatar === 'string' ? saved[actor].avatar : '';
      });
      return result;
    }

    function writeProfiles(profiles) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
      window.dispatchEvent(new CustomEvent('ibcy:identity-change', { detail: clone(profiles) }));
    }

    function getProfile(actor) {
      var profiles = readProfiles();
      return clone(profiles[actor] || defaults[actor] || { id: actor, name: actor, initial: '?', avatar: '' });
    }

    function buildAvatar(actor, className) {
      var profile = getProfile(actor);
      var node = document.createElement('span');
      node.className = className || 'cy-paw-row-avatar';
      node.dataset.actor = actor;
      node.setAttribute('aria-label', profile.name + '头像');
      if (profile.avatar) {
        var img = document.createElement('img');
        img.src = profile.avatar;
        img.alt = '';
        node.appendChild(img);
      } else {
        var text = document.createElement('span');
        text.className = 'cy-avatar-initial';
        text.textContent = profile.initial;
        node.appendChild(text);
      }
      return node;
    }

    function refreshAvatarNode(node, actor) {
      if (!node) return;
      var replacement = buildAvatar(actor, node.className);
      node.replaceWith(replacement);
    }

    function decorateRow(row) {
      if (!row || !row.classList || !row.classList.contains('cy-paw-event-row')) return;
      var actor = row.classList.contains('cy-paw-from-chen') ? 'chen' : 'yingying';
      var existing = row.querySelector(':scope > .cy-paw-row-avatar');
      if (existing) {
        if (existing.dataset.actor !== actor) refreshAvatarNode(existing, actor);
        return;
      }
      var avatar = buildAvatar(actor, 'cy-paw-row-avatar');
      row.classList.add('cy-paw-has-avatar');
      if (actor === 'chen') row.insertBefore(avatar, row.firstChild);
      else row.appendChild(avatar);
    }

    function refreshInteractionAvatars() {
      document.querySelectorAll('#conv #cv-msgs .mrow.cy-paw-event-row').forEach(function (row) {
        var actor = row.classList.contains('cy-paw-from-chen') ? 'chen' : 'yingying';
        var existing = row.querySelector(':scope > .cy-paw-row-avatar');
        if (existing) refreshAvatarNode(existing, actor);
        else decorateRow(row);
        row.classList.add('cy-paw-has-avatar');
      });
    }

    function observeMessages() {
      var box = document.getElementById('cv-msgs');
      if (!box) {
        window.setTimeout(observeMessages, 250);
        return;
      }
      if (observer) observer.disconnect();
      observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
            if (!node || node.nodeType !== 1) return;
            if (node.matches && node.matches('.mrow.cy-paw-event-row')) decorateRow(node);
            if (node.querySelectorAll) node.querySelectorAll('.mrow.cy-paw-event-row').forEach(decorateRow);
          });
        });
      });
      observer.observe(box, { childList: true, subtree: true });
      refreshInteractionAvatars();
    }

    function compressImage(file) {
      return new Promise(function (resolve, reject) {
        if (!file || !/^image\//.test(file.type || '')) {
          reject(new Error('请选择图片文件'));
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取图片失败')); };
        reader.onload = function () {
          var img = new Image();
          img.onerror = function () { reject(new Error('图片无法打开')); };
          img.onload = function () {
            var size = 256;
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('无法处理图片'));
              return;
            }
            var sourceSize = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
            var sx = Math.max(0, ((img.naturalWidth || img.width) - sourceSize) / 2);
            var sy = Math.max(0, ((img.naturalHeight || img.height) - sourceSize) / 2);
            ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.86));
          };
          img.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
      });
    }

    function renderProfileCard(actor) {
      if (!modal) return;
      var profile = getProfile(actor);
      var card = modal.querySelector('[data-profile="' + actor + '"]');
      if (!card) return;
      var holder = card.querySelector('.cy-id-avatar');
      holder.innerHTML = '';
      holder.appendChild(buildAvatar(actor, 'cy-id-avatar-inner'));
      var state = card.querySelector('.cy-id-profile-state');
      if (state) state.textContent = profile.avatar ? '已使用自选头像' : '正在使用字头像';
    }

    function renderModal() {
      renderProfileCard('yingying');
      renderProfileCard('chen');
    }

    function setStatus(text, error) {
      if (!modal) return;
      var node = modal.querySelector('#cy-id-status');
      if (!node) return;
      node.textContent = text || '';
      node.classList.toggle('error', Boolean(error));
    }

    function setAvatar(actor, dataUrl) {
      var profiles = readProfiles();
      if (!profiles[actor]) return;
      profiles[actor].avatar = String(dataUrl || '');
      try {
        writeProfiles(profiles);
      } catch (error) {
        throw new Error('头像保存失败，可能是本机存储空间不足');
      }
      renderProfileCard(actor);
      refreshInteractionAvatars();
    }

    function resetAvatar(actor) {
      setAvatar(actor, '');
      setStatus('已恢复字头像');
    }

    function chooseAvatar(actor) {
      activeActor = actor;
      var input = modal && modal.querySelector('#cy-id-file');
      if (!input) return;
      input.value = '';
      input.click();
    }

    function ensureModal() {
      if (modal) return modal;
      modal = document.createElement('div');
      modal.id = 'cy-id-mask';
      modal.className = 'cy-id-mask';
      modal.hidden = true;
      modal.innerHTML =
        '<section class="cy-id-sheet" role="dialog" aria-modal="true" aria-labelledby="cy-id-title">' +
          '<div class="cy-id-head"><div><small>CY IDENTITIES</small><h3 id="cy-id-title">我们两个的头像</h3></div><button class="cy-id-close" type="button" aria-label="关闭">×</button></div>' +
          '<p class="cy-id-hint">头像只保存在这台设备，不会提交到公开仓库。互动按钮会自动读取这里的头像。</p>' +
          '<div class="cy-id-profile" data-profile="yingying">' +
            '<div class="cy-id-avatar"></div><div class="cy-id-profile-copy"><b>莹莹</b><span class="cy-id-profile-state"></span></div>' +
            '<div class="cy-id-profile-actions"><button type="button" data-pick="yingying">换头像</button><button type="button" data-reset="yingying">恢复</button></div>' +
          '</div>' +
          '<div class="cy-id-profile" data-profile="chen">' +
            '<div class="cy-id-avatar"></div><div class="cy-id-profile-copy"><b>澈</b><span class="cy-id-profile-state"></span></div>' +
            '<div class="cy-id-profile-actions"><button type="button" data-pick="chen">换头像</button><button type="button" data-reset="chen">恢复</button></div>' +
          '</div>' +
          '<div class="cy-id-status" id="cy-id-status" aria-live="polite"></div>' +
          '<input id="cy-id-file" type="file" accept="image/*" hidden>' +
        '</section>';
      document.body.appendChild(modal);

      modal.querySelector('.cy-id-close').addEventListener('click', closeSetup);
      modal.addEventListener('click', function (event) { if (event.target === modal) closeSetup(); });
      modal.querySelectorAll('[data-pick]').forEach(function (button) {
        button.addEventListener('click', function () { chooseAvatar(button.getAttribute('data-pick')); });
      });
      modal.querySelectorAll('[data-reset]').forEach(function (button) {
        button.addEventListener('click', function () { resetAvatar(button.getAttribute('data-reset')); });
      });
      modal.querySelector('#cy-id-file').addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        if (!file || !activeActor) return;
        setStatus('正在处理头像…');
        compressImage(file).then(function (dataUrl) {
          setAvatar(activeActor, dataUrl);
          setStatus('头像已保存');
        }).catch(function (error) {
          setStatus(String(error.message || error), true);
        });
      });
      renderModal();
      return modal;
    }

    function openSetup() {
      ensureModal();
      renderModal();
      setStatus('');
      modal.hidden = false;
    }

    function closeSetup() {
      if (modal) modal.hidden = true;
    }

    function installEntry() {
      var tools = document.querySelector('#cy-paw-panel .cy-paw-tools');
      if (!tools || document.getElementById('cy-avatar-settings')) {
        if (!tools) window.setTimeout(installEntry, 250);
        return;
      }
      var button = document.createElement('button');
      button.id = 'cy-avatar-settings';
      button.type = 'button';
      button.textContent = '头像';
      button.addEventListener('click', openSetup);
      tools.insertBefore(button, tools.firstChild);
    }

    window.addEventListener('ibcy:identity-change', refreshInteractionAvatars);
    shell.identity = {
      getProfile: getProfile,
      getProfiles: readProfiles,
      setAvatar: setAvatar,
      resetAvatar: resetAvatar,
      openSetup: openSetup,
      refresh: refreshInteractionAvatars
    };

    ensureModal();
    installEntry();
    observeMessages();
  });
}());
