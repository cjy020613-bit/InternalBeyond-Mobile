(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__interactionThreadV2Installed) return;
    shell.__interactionThreadV2Installed = true;

    var polls = 0;

    function lexicon() {
      try {
        if (shell.interactions && typeof shell.interactions.getLexicon === 'function') return shell.interactions.getLexicon();
      } catch (error) {}
      return { actions: [], targets: [], counts: [] };
    }

    function identityAddon() {
      var current = lexicon();
      var actions = (current.actions || []).map(function (item) {
        return String(item.id || '') + '=' + String(item.label || '');
      }).join(', ');
      var targets = (current.targets || []).map(String).join(', ');
      var counts = (current.counts || []).map(Number).join(', ');
      return '[CY_SHARED_INTERACTION_IDENTITY_V2]\n' +
        'CY 的互动按钮是莹莹可编辑、与你双向共享的实时能力。当前词库优先于任何旧的默认列表。' +
        '动作：' + actions + '。落点：' + targets + '。次数快捷项：' + counts + '。' +
        '不要声称只能使用旧的六个默认动作；当前词库里存在的自定义动作和落点都可以正常使用。' +
        '主动触发时遵循当前 CY_PAW V2 机器协议。';
    }

    function wrapFetch() {
      var current = window.fetch;
      if (!current || current.__ibcyInteractionThreadV2) return;
      var wrapped = function (input, init) {
        var cfg = null;
        var originalPrompt = null;
        try {
          cfg = typeof _activeCfg !== 'undefined' ? _activeCfg : null;
          if (cfg && (cfg.subscriptionGateway || cfg.id === 'cy_codex_chen')) {
            originalPrompt = String(cfg.systemPrompt || '');
            var cut = originalPrompt.indexOf('\n\n[CY_SHARED_INTERACTION_IDENTITY_V2]');
            if (cut < 0) cut = originalPrompt.indexOf('[CY_SHARED_INTERACTION_IDENTITY_V2]');
            if (cut >= 0) originalPrompt = originalPrompt.slice(0, cut).trimEnd();
            cfg.systemPrompt = originalPrompt + '\n\n' + identityAddon();
          }
          var result = current(input, init);
          if (cfg && originalPrompt !== null) cfg.systemPrompt = originalPrompt;
          return result;
        } catch (error) {
          if (cfg && originalPrompt !== null) cfg.systemPrompt = originalPrompt;
          return current(input, init);
        }
      };
      wrapped.__ibcyInteractionThreadV2 = true;
      window.fetch = wrapped;
    }

    function keepWrapped() {
      wrapFetch();
      polls += 1;
      if (polls < 20) window.setTimeout(keepWrapped, 300);
    }

    window.addEventListener('ibcy:interaction-lexicon-change', function () {
      polls = 0;
      keepWrapped();
    });

    keepWrapped();
  });
}());
