/* InternalBeyond Mobile — CY overlay on upstream V2.5.5 service worker.
   Network-first with fast offline fallback; same-origin HTML is injected with CY modules.
   AI/provider requests remain outside this service worker. */
const IB_CACHE='ib-cache-v24-cy-v255';
const NAV_TIMEOUT=20000,ASSET_TIMEOUT=9000,FAST_FALLBACK=3500;
const IB_CORE=[
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './custom/cy-shell.css',
  './custom/cy-shell.js',
  './custom/cy-ob-bridge.js',
  './custom/cy-gateway.css',
  './custom/cy-gateway.js',
  './custom/cy-gateway-defaults.js',
  './custom/cy-sse-error-fix.js',
  './custom/cy-gateway-nonstream.js',
  './custom/cy-model-picker.css',
  './custom/cy-model-picker.js',
  './custom/cy-mutual-paw.css',
  './custom/cy-paw-align-fix.css',
  './custom/cy-mutual-paw.js',
  './custom/cy-interaction-lexicon.js',
  './custom/cy-interaction-protocol-v2.js',
  './custom/cy-paw-stream-fast.js',
  './custom/cy-interaction-thread-v2.js',
  './custom/cy-chat-polish.css',
  './custom/cy-chat-polish.js',
  './custom/cy-interaction-editor.css',
  './custom/cy-native-avatar.css',
  './apps/catalog.json',
  './apps/catalog.js'
];
const CY_HEAD='<link rel="stylesheet" href="./custom/cy-shell.css?v=0.5.0" data-ibcy-loader="1"><link rel="stylesheet" href="./custom/cy-mutual-paw.css?v=0.2.0" data-ibcy-loader="1"><link rel="stylesheet" href="./custom/cy-paw-align-fix.css?v=0.1.0" data-ibcy-loader="1"><link rel="stylesheet" href="./custom/cy-chat-polish.css?v=0.3.0" data-ibcy-loader="1"><link rel="stylesheet" href="./custom/cy-interaction-editor.css?v=0.1.0" data-ibcy-loader="1"><link rel="stylesheet" href="./custom/cy-native-avatar.css?v=0.1.0" data-ibcy-loader="1"><link rel="stylesheet" href="./custom/cy-model-picker.css?v=0.1.0" data-ibcy-loader="1">';
const CY_BODY='<script src="./custom/cy-gateway-defaults.js?v=0.2.0" data-ibcy-loader="1"></script><script src="./custom/cy-shell.js?v=0.5.0" data-ibcy-loader="1"></script><script src="./custom/cy-ob-bridge.js?v=0.5.0" data-ibcy-loader="1"></script><script src="./custom/cy-mutual-paw.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-interaction-lexicon.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-interaction-protocol-v2.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-paw-stream-fast.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-interaction-thread-v2.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-chat-polish.js?v=0.3.0" data-ibcy-loader="1"></script><script src="./custom/cy-sse-error-fix.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-gateway-nonstream.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-model-picker.js?v=0.1.0" data-ibcy-loader="1"></script>';

function injectCY(response){
  if(!response||!response.ok)return Promise.resolve(response);
  const type=response.headers.get('content-type')||'';
  if(type.indexOf('text/html')<0)return Promise.resolve(response);
  return response.text().then(function(html){
    if(html.indexOf('data-ibcy-loader')<0){
      if(html.indexOf('</head>')>=0)html=html.replace('</head>',CY_HEAD+'</head>');
      if(html.indexOf('</body>')>=0)html=html.replace('</body>',CY_BODY+'</body>');
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(html,{status:response.status,statusText:response.statusText,headers:headers});
  });
}
function withTimeout(p,ms){
  return new Promise(function(resolve,reject){
    var t=setTimeout(function(){reject(new Error('timeout'))},ms);
    p.then(function(v){clearTimeout(t);resolve(v)},function(err){clearTimeout(t);reject(err)});
  });
}
function offlinePage(){
  return new Response('<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CY</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Noto Sans SC\',sans-serif;background:#eef2f8;color:#132a52"><div style="text-align:center;padding:24px"><div style="font-size:1.05rem;margin-bottom:10px">暂时加载不上</div><div style="font-size:.84rem;color:#3b5686;line-height:1.7">本机还没有离线副本，网络也没回应。<br>检查网络后点下面重试。</div><button onclick="location.reload()" style="margin-top:18px;height:40px;padding:0 22px;border-radius:999px;border:1px solid rgba(120,168,222,.6);background:#fff;color:#3f74ad;font-size:.9rem">重试</button></div></body>',{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
}

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(IB_CACHE).then(function(cache){
    return Promise.all(IB_CORE.map(function(url){return cache.add(url).catch(function(){return null})}));
  }).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(key){return key!==IB_CACHE}).map(function(key){return caches.delete(key)}));
  }).then(function(){return self.clients.claim()}).then(function(){
    return self.clients.matchAll({type:'window',includeUncontrolled:true});
  }).then(function(clients){
    return Promise.all(clients.map(function(client){
      if(!client.navigate)return null;
      return client.navigate(client.url).catch(function(){return null});
    }));
  }));
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;

  var isNav=e.request.mode==='navigate'||e.request.destination==='document';
  var net=fetch(e.request).then(function(response){
    if(response&&response.ok){
      var copy=response.clone();
      caches.open(IB_CACHE).then(function(cache){cache.put(e.request,copy)}).catch(function(){});
    }
    return response;
  });

  if(isNav){
    e.waitUntil(net.then(function(){},function(){}));
    e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(function(cached){
      if(!cached){
        return withTimeout(net,NAV_TIMEOUT).then(injectCY).catch(function(){
          return caches.match('./index.html').then(function(index){
            return index?injectCY(index):offlinePage();
          });
        });
      }
      var fast=new Promise(function(resolve){setTimeout(function(){resolve(cached)},FAST_FALLBACK)});
      return Promise.race([
        withTimeout(net,NAV_TIMEOUT).catch(function(){return cached}),
        fast
      ]).then(injectCY);
    }));
    return;
  }

  e.respondWith(withTimeout(net,ASSET_TIMEOUT).catch(function(){
    return caches.match(e.request,{ignoreSearch:true}).then(function(match){
      if(match)return match;
      throw new Error('offline');
    });
  }));
});
