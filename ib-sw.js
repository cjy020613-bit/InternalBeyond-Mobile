/* InternalBeyond Mobile — CY service worker overlay.
   Keeps upstream index.html untouched and injects the CY shell at response time. */
const IB_CACHE='ib-cache-v22-cy';
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
const CY_BODY='<script src="./custom/cy-gateway-defaults.js?v=0.2.0" data-ibcy-loader="1"></script><script src="./custom/cy-shell.js?v=0.5.0" data-ibcy-loader="1"></script><script src="./custom/cy-ob-bridge.js?v=0.5.0" data-ibcy-loader="1"></script><script src="./custom/cy-mutual-paw.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-interaction-lexicon.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-interaction-protocol-v2.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-paw-stream-fast.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-interaction-thread-v2.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-chat-polish.js?v=0.3.0" data-ibcy-loader="1"></script><script src="./custom/cy-sse-error-fix.js?v=0.1.0" data-ibcy-loader="1"></script><script src="./custom/cy-model-picker.js?v=0.1.0" data-ibcy-loader="1"></script>';

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

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(IB_CACHE).then(function(c){
    return Promise.all(IB_CORE.map(function(url){return c.add(url).catch(function(){return null;});}));
  }).then(function(){return self.skipWaiting();}));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(key){return key!==IB_CACHE;}).map(function(key){return caches.delete(key);}));
  }).then(function(){return self.clients.claim();}).then(function(){
    return self.clients.matchAll({type:'window',includeUncontrolled:true});
  }).then(function(clients){
    return Promise.all(clients.map(function(client){
      if(!client.navigate)return null;
      return client.navigate(client.url).catch(function(){return null;});
    }));
  }));
});

self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;

  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(function(response){
      return injectCY(response);
    }).then(function(response){
      if(response&&response.ok){
        const copy=response.clone();
        caches.open(IB_CACHE).then(function(cache){cache.put(e.request,copy);});
      }
      return response;
    }).catch(function(){
      return caches.match(e.request,{ignoreSearch:true}).then(function(match){
        if(match)return injectCY(match);
        return caches.match('./index.html').then(function(index){
          if(index)return injectCY(index);
          throw new Error('offline');
        });
      });
    }));
    return;
  }

  e.respondWith(fetch(e.request).then(function(response){
    if(response&&response.ok){
      const copy=response.clone();
      caches.open(IB_CACHE).then(function(cache){cache.put(e.request,copy);});
    }
    return response;
  }).catch(function(){
    return caches.match(e.request,{ignoreSearch:true}).then(function(match){
      if(match)return match;
      throw new Error('offline');
    });
  }));
});
