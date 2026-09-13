(function () {
  'use strict';

  var api = window.IBCY;
  if (!api || typeof api.ready !== 'function') return;

  api.ready(function (shell) {
    if (shell.__pawStreamFastInstalled) return;
    shell.__pawStreamFastInstalled = true;

    var PROCESSED_KEY = 'ibcy.paw.v2.processed.v1';
    var MARKER_RE = /\[\[CY_PAW\s+([^\]]{1,512})\]\]/g;
    var scheduled = false;
    var busy = false;

    function readProcessed() {
      try {
        var value = JSON.parse(localStorage.getItem(PROCESSED_KEY) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch (error) {
        return {};
      }
    }

    function markProcessed(key) {
      var map = readProcessed();
      map[key] = Date.now();
      var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 160);
      var trimmed = {};
      keys.forEach(function (item) { trimmed[item] = map[item]; });
      try { localStorage.setItem(PROCESSED_KEY, JSON.stringify(trimmed)); } catch (error) {}
    }

    function isProcessed(key) {
      return Boolean(readProcessed()[key]);
    }

    function parseAttributes(text) {
      var attrs = {};
      var re = /([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g;
      var match;
      while ((match = re.exec(text))) attrs[match[1]] = match[2];
      return attrs;
    }

    function removeMarkerTail(textEl, markerStart) {
      if (!textEl || markerStart < 0 || !document.createRange) return;
      var walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
      var total = 0;
      var node;
      var startNode = null;
      var startOffset = 0;
      while ((node = walker.nextNode())) {
        var length = (node.nodeValue || '').length;
        if (markerStart <= total + length) {
          startNode = node;
          startOffset = Math.max(0, markerStart - total);
          break;
        }
        total += length;
      }
      if (!startNode) return;
      try {
        var range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(textEl, textEl.childNodes.length);
        range.deleteContents();
      } catch (error) {}
    }

    async function processBubble(bubble) {
      if (!bubble || !bubble.matches('.m[data-id]')) return;
      var row = bubble.closest('.mrow');
      if (!row || !row.classList.contains('ai')) return;
      var textEl = bubble.querySelector('.m-text');
      if (!textEl) return;
      var visible = String(textEl.textContent || '');
      if (visible.indexOf('[[CY_PAW') < 0 || visible.indexOf(']]') < 0) return;

      var messageId = String(bubble.getAttribute('data-id') || '');
      var commands = [];
      MARKER_RE.lastIndex = 0;
      var match;
      while ((match = MARKER_RE.exec(visible))) {
        var attrs = parseAttributes(match[1]);
        if (!attrs.action) continue;
        commands.push({
          index: commands.length,
          start: match.index,
          action: String(attrs.action || '').slice(0, 64),
          body_target: String(attrs.body_target || '').slice(0, 18),
          count: Math.max(1, Math.min(99, Math.round(Number(attrs.count) || 1)))
        });
      }
      if (!commands.length) return;

      removeMarkerTail(textEl, commands[0].start);

      for (var i = 0; i < commands.length; i += 1) {
        var command = commands[i];
        var key = 'v2:' + messageId + ':' + command.index + ':' + command.action + ':' + command.body_target + ':' + command.count;
        if (isProcessed(key)) continue;
        markProcessed(key);
        try {
          if (shell.paw && typeof shell.paw.receiveInteraction === 'function') {
            await shell.paw.receiveInteraction({
              action: command.action,
              body_target: command.body_target,
              count: command.count
            });
          }
        } catch (error) {}
      }
    }

    async function scan() {
      if (busy) return;
      busy = true;
      try {
        var bubbles = document.querySelectorAll('#conv #cv-msgs .mrow.ai .m[data-id]');
        for (var i = Math.max(0, bubbles.length - 6); i < bubbles.length; i += 1) {
          await processBubble(bubbles[i]);
        }
      } finally {
        busy = false;
      }
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        scan().catch(function () {});
      });
    }

    function observe() {
      var box = document.getElementById('cv-msgs');
      if (!box || !window.MutationObserver) {
        window.setTimeout(observe, 180);
        return;
      }
      new MutationObserver(schedule).observe(box, { childList: true, subtree: true, characterData: true });
      schedule();
    }

    observe();
  });
}());
