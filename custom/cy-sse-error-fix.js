(function () {
  'use strict';

  function errorMessage(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.message === 'string' && value.message.trim()) return value.message;
    if (typeof value.error === 'string' && value.error.trim()) return value.error;
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  }

  function install() {
    var original = null;
    try { original = window.extractDelta; } catch (error) {}
    if (typeof original !== 'function' || original.__ibcySseErrorFix) return false;

    var wrapped = function (fmt, payload) {
      if (payload && payload.error) {
        var message = errorMessage(payload.error) || 'CY 网关返回错误';
        throw new Error(message);
      }
      return original.apply(this, arguments);
    };
    wrapped.__ibcySseErrorFix = true;
    wrapped.__ibcyOriginal = original;

    try { window.extractDelta = wrapped; } catch (error) {}
    try { extractDelta = wrapped; } catch (error) {}
    return true;
  }

  if (install()) return;
  var tries = 0;
  var timer = window.setInterval(function () {
    tries += 1;
    if (install() || tries >= 40) window.clearInterval(timer);
  }, 100);
}());
