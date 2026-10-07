(function(){
  if(window.__IBCY_BOOTSTRAPPED__)return;
  window.__IBCY_BOOTSTRAPPED__=1;
  var head=document.head||document.documentElement;
  [
    './custom/cy-shell.css?v=0.5.0',
    './custom/cy-mutual-paw.css?v=0.2.0',
    './custom/cy-paw-align-fix.css?v=0.1.0',
    './custom/cy-chat-polish.css?v=0.3.0',
    './custom/cy-interaction-editor.css?v=0.1.0',
    './custom/cy-native-avatar.css?v=0.1.0',
    './custom/cy-model-picker.css?v=0.1.0'
  ].forEach(function(href){
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    link.dataset.ibcyLoader='1';
    head.appendChild(link);
  });
  var files=[
    './custom/cy-gateway-defaults.js?v=0.2.0',
    './custom/cy-shell.js?v=0.5.0',
    './custom/cy-ob-bridge.js?v=0.5.0',
    './custom/cy-mutual-paw.js?v=0.1.0',
    './custom/cy-interaction-lexicon.js?v=0.1.0',
    './custom/cy-interaction-protocol-v2.js?v=0.1.0',
    './custom/cy-paw-stream-fast.js?v=0.1.0',
    './custom/cy-interaction-thread-v2.js?v=0.1.0',
    './custom/cy-chat-polish.js?v=0.3.0',
    './custom/cy-sse-error-fix.js?v=0.1.0',
    './custom/cy-gateway-nonstream.js?v=0.1.0',
    './custom/cy-model-picker.js?v=0.1.0'
  ];
  function load(i){
    if(i>=files.length)return;
    var s=document.createElement('script');
    s.src=files[i];
    s.dataset.ibcyLoader='1';
    s.onload=s.onerror=function(){load(i+1)};
    (document.body||document.documentElement).appendChild(s);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){load(0)},{once:true});
  }else{
    load(0);
  }
})();