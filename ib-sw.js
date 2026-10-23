/* InternalBeyond Mobile — upstream-compatible service worker.
   Only installs the native ChatGPT/Codex provider connector; no CY UI overlays. */
const IB_CACHE='ib-cache-v25-native-codex';
const NAV_TIMEOUT=20000,ASSET_TIMEOUT=9000,FAST_FALLBACK=3500;
const IB_CORE=[
  './','./index.html','./manifest.webmanifest',
  './icon-192.png','./icon-512.png',
  './custom/ib-codex-provider.js',
  './apps/catalog.json','./apps/catalog.js'
];
const PROVIDER_SCRIPT='<script src="./custom/ib-codex-provider.js?v=1" data-ib-native-codex="1"></script>';
function injectNativeProvider(response){
  if(!response||!response.ok)return Promise.resolve(response);
  if(!/text\/html/i.test(response.headers.get('content-type')||''))return Promise.resolve(response);
  return response.text().then(function(html){
    if(html.indexOf('data-ib-native-codex')<0&&html.indexOf('</body>')>=0){
      html=html.replace('</body>',PROVIDER_SCRIPT+'</body>');
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  });
}
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(IB_CACHE).then(function(c){
    return Promise.all(IB_CORE.map(function(url){return c.add(url).catch(function(){return null})}));
  }).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==IB_CACHE}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}).then(function(){
    return self.clients.matchAll({type:'window',includeUncontrolled:true});
  }).then(function(clients){
    return Promise.all(clients.map(function(client){
      return client.navigate?client.navigate(client.url).catch(function(){return null}):null;
    }));
  }));
});
function withTimeout(p,ms){
  return new Promise(function(resolve,reject){
    var t=setTimeout(function(){reject(new Error('timeout'))},ms);
    p.then(function(v){clearTimeout(t);resolve(v)},function(err){clearTimeout(t);reject(err)});
  });
}
function offlinePage(){
  return new Response('<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InternalBeyond</title><body style="font-family:system-ui;text-align:center;padding:40px"><h3>暂时加载不上</h3><p>本机还没有离线副本，检查网络后重试。</p><button onclick="location.reload()">重试</button></body>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
}
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  const isNav=e.request.mode==='navigate'||e.request.destination==='document';
  if(isNav){
    const net=fetch(e.request).then(injectNativeProvider).then(function(response){
      if(response&&response.ok){
        const copy=response.clone();
        caches.open(IB_CACHE).then(function(cache){return cache.put(e.request,copy)}).catch(function(){});
      }
      return response;
    });
    e.waitUntil(net.then(function(){},function(){}));
    e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(function(cached){
      function fallback(){
        if(cached)return injectNativeProvider(cached);
        return caches.match('./index.html').then(function(index){
          return index?injectNativeProvider(index):offlinePage();
        });
      }
      if(!cached)return withTimeout(net,NAV_TIMEOUT).catch(fallback);
      const fast=new Promise(function(resolve){
        setTimeout(function(){resolve(injectNativeProvider(cached))},FAST_FALLBACK);
      });
      return Promise.race([withTimeout(net,NAV_TIMEOUT).catch(fallback),fast]);
    }));
    return;
  }
  const net=fetch(e.request).then(function(response){
    if(response&&response.ok){
      const copy=response.clone();
      caches.open(IB_CACHE).then(function(cache){return cache.put(e.request,copy)}).catch(function(){});
    }
    return response;
  });
  e.waitUntil(net.then(function(){},function(){}));
  e.respondWith(withTimeout(net,ASSET_TIMEOUT).catch(function(){
    return caches.match(e.request,{ignoreSearch:true}).then(function(match){
      if(match)return match;
      throw new Error('offline');
    });
  }));
});
