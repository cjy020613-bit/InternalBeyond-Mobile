/* IB native ChatGPT subscription provider: keep upstream UI and data stores. */
(function () {
  'use strict';
  var ID='codex', LEGACY='ibcy.gateway.settings.v1';
  var ENDPOINT='https://codex-gateway-v2-production.up.railway.app/v1/chat/completions';
  var MODEL='gpt-5.6-terra';
  var installed=false, current='', polling=0, loginTimer=0;
  var rawFetch=window.fetch.bind(window);
  function element(id){return document.getElementById(id)}
  function legacy(){
    try{return JSON.parse(localStorage.getItem(LEGACY)||'{}')||{}}catch(_){return{}}
  }
  function endpoint(value){
    var str=String(value||'').trim().replace(/\/+$/,'');
    if(!str)return'';
    if(!/^https?:\/\//i.test(str))str='https://'+str;
    if(!/\/v1\/chat\/completions$/i.test(str))str+='/v1/chat/completions';
    return str;
  }
  function baseUrl(){
    var url=endpoint(element('aset-endpoint')&&element('aset-endpoint').value);
    if(!url)throw Error('先填写你的网关地址');
    var u=new URL(url);
    if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('网关必须使用 HTTPS');
    return url.replace(/\/v1\/chat\/completions$/i,'');
  }
  function token(){
    return String(element('aset-key')&&element('aset-key').value||'').trim();
  }
  function ensureToken(){
    if(!token())throw Error('先填写网关配对口令（不是 ChatGPT 密码）');
  }
  function text(message,bad){
    var n=element('ib-codex-status');
    if(n){n.textContent=String(message||'');n.style.color=bad?'#c45e5e':'var(--tx2)'}
  }
  async function request(path,options){
    var host=baseUrl();
    ensureToken();
    var options0=options||{};
    var headers=new Headers(options0.headers||{});
    headers.set('Authorization','Bearer '+token());
    headers.set('Accept','application/json');
    var result=await rawFetch(host+path,Object.assign({cache:'no-store'},options0,{headers:headers}));
    var payload={};
    try{payload=await result.json()}catch(_){}
    if(!result.ok)throw Error((payload.error&&payload.error.message)||payload.detail||('HTTP '+result.status));
    return payload;
  }
  function clearLogin(){
    if(loginTimer){clearTimeout(loginTimer);loginTimer=0}
  }
  async function checkStatus(){
    text('正在检查订阅连接…');
    try{
      var data=await request('/v1/codex/status');
      if(data.logged_in){
        var a=data.account||{};
        text('已连接 ChatGPT · '+String(a.planType||a.plan_type||a.plan||'订阅账户'));
      }else text('网关可连接，尚未登录 ChatGPT');
      return data;
    }catch(err){text('连接失败：'+String(err.message||err),true);throw err}
  }
  async function login(){
    clearLogin();
    text('正在向你自己的网关申请登录设备码…');
    var data;
    try{data=await request('/v1/codex/login/device',{method:'POST'})}
    catch(err){text('发起登录失败：'+String(err.message||err),true);return}
    if(!data.login_id||!data.user_code){text('网关没有返回完整的设备码',true);return}
    var code=element('ib-codex-code'),link=element('ib-codex-link');
    if(code)code.textContent=String(data.user_code);
    if(link){
      var href='https://auth.openai.com';
      try{var u=new URL(String(data.verification_url||href));if(u.protocol==='https:'&&/(^|\.)openai\.com$/i.test(u.hostname))href=u.href}catch(_){}
      link.href=href;
      link.style.display='';
    }
    text('在 OpenAI 官方网页输入设备码，授权完成后会自动确认。');
    var started=Date.now();
    async function poll(){
      if(Date.now()-started>180000){text('登录确认超时，可重新点击「登录 ChatGPT」',true);return}
      try{
        var state=await request('/v1/codex/login/device/'+encodeURIComponent(String(data.login_id)));
        if(state.status==='completed'){
          if(code)code.textContent='';
          if(link)link.style.display='none';
          await checkStatus();
          return;
        }
        if(state.status==='failed'||state.status==='cancelled')throw Error(state.error||'登录未完成');
      }catch(err){text('登录检查失败：'+String(err.message||err),true);return}
      loginTimer=setTimeout(poll,1800);
    }
    loginTimer=setTimeout(poll,1800);
  }
  function setSwitch(id,on){
    var n=element(id);if(!n)return;
    if(typeof sw2==='function')sw2(n,on);
    else n.classList.toggle('on',!!on);
  }
  function sync(){
    if(!installed)return;
    var selected=element('aset-provider')&&element('aset-provider').value===ID;
    var panel=element('ib-codex-native');
    if(panel)panel.style.display=selected?'':'none';
    var keyInput=element('aset-key');
    if(keyInput){
      var group=keyInput.closest('.f-group');
      var label=group&&group.querySelector('label');
      if(label)label.textContent=selected?'网关配对口令（不是 OpenAI API Key）':'API Key';
    }
    if(selected){
      setSwitch('aset-stream',false);
      setSwitch('aset-vision',false);
      setSwitch('aset-cache',false);
      setSwitch('aset-web',false);
    } else clearLogin();
  }
  function attach(){
    if(installed)return;
    if(typeof PROVIDERS==='undefined'||!element('aset-provider')||!element('aset-key'))return;
    PROVIDERS[ID]={name:'ChatGPT 订阅 (Codex)',endpoint:ENDPOINT,model:MODEL,format:'openai',vision:false};
    var sel=element('aset-provider'),opt=document.createElement('option');
    if(!sel.querySelector('option[value="'+ID+'"]')){
      opt.value=ID;opt.textContent=PROVIDERS[ID].name;
      var custom=sel.querySelector('option[value="custom"]');
      if(custom)sel.insertBefore(opt,custom);else sel.appendChild(opt);
    }
    var group=element('aset-key').closest('.f-group');
    var box=document.createElement('div');
    box.id='ib-codex-native';
    box.className='f-group';
    box.style.cssText='display:none;margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:12px';
    box.innerHTML='<div style="font-weight:600;margin-bottom:7px">ChatGPT 订阅授权</div>'+
      '<p class="hint">使用已有的 Codex 网关连接 ChatGPT 订阅。接口地址填自己的 HTTPS 网关，密钥栏填网关配对口令，不需要 OpenAI API Key；ChatGPT 密码只在 OpenAI 官方页面输入。</p>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">'+
      '<button class="btn" type="button" id="ib-codex-check">检查连接</button>'+
      '<button class="btn" type="button" id="ib-codex-login">登录 ChatGPT</button></div>'+
      '<p class="hint" id="ib-codex-status" aria-live="polite" style="margin:9px 0 4px">点击「检查连接」验证登录状态。</p>'+
      '<a id="ib-codex-link" href="https://auth.openai.com" rel="noopener noreferrer" target="_blank" style="display:none">打开 OpenAI 官方验证页面</a>'+
      '<div id="ib-codex-code" style="font-size:1.1rem;font-weight:700;letter-spacing:0.1em;user-select:all"></div>';
    group.insertAdjacentElement('afterend',box);
    element('ib-codex-check').addEventListener('click',function(){checkStatus().catch(function(){})});
    element('ib-codex-login').addEventListener('click',function(){login().catch(function(err){text(String(err.message||err),true)})});
    current=sel.value;
    sel.addEventListener('change',function(){
      var now=sel.value,was=current;
      if(now===ID&&was!==ID){
        var old=legacy();
        var ep=element('aset-endpoint');
        if(ep&&(!ep.value||ep.value===PROVIDERS[was]?.endpoint))ep.value=endpoint(old.endpoint)||ENDPOINT;
        var model=element('aset-model');
        if(model&&(!model.value||model.value===PROVIDERS[was]?.model))model.value=String(old.model||MODEL);
        element('aset-key').value=String(old.token||'');
      }
      if(was===ID&&now!==ID)element('aset-key').value='';
      current=now;sync();
    });
    element('aset-endpoint').addEventListener('blur',function(){
      if(sel.value===ID)this.value=endpoint(this.value);
    });
    window.IBCodexNativeSync=sync;
    installed=true;
    sync();
    // Native openAset sets the selected provider without dispatching change.
    var root=element('sub-aset');
    if(root&&typeof MutationObserver!=='undefined')new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['class','style','hidden']});
    // Keep the provider-specific toggles off even after openAset restores a saved config.
    setInterval(sync,1000);
    migrate().catch(function(err){console.warn('[IB Codex] migration skipped:',err)});
  }
  async function migrate(){
    for(var attempt=0;attempt<24;attempt++){
      try{
        if(typeof dbGetAll==='function'&&typeof dbPut==='function'){
          var configs=await dbGetAll('apiConfigs');
          if(Array.isArray(configs)){
            var old=legacy(),changed=false;
            for(var i=0;i<configs.length;i++){
              var cfg=configs[i];
              if(!cfg||!cfg.subscriptionGateway)continue;
              cfg.provider=ID;
              cfg.endpoint=endpoint(cfg.endpoint||old.endpoint)||ENDPOINT;
              cfg.apiKey=cfg.apiKey||old.token||'';
              cfg.model=cfg.model||old.model||MODEL;
              cfg.streaming=false;
              cfg.promptCache=false;
              cfg.vision=false;
              delete cfg.subscriptionGateway;
              await dbPut('apiConfigs',cfg);
              changed=true;
            }
            if(changed&&typeof loadCfgs==='function')await loadCfgs();
            return;
          }
        }
      }catch(_){}
      await new Promise(function(resolve){setTimeout(resolve,500)});
    }
  }
  function installFetchBridge(){
    if(window.fetch.__ibNativeCodex)return;
    var fn=function(input,init){
      try{
        var target=typeof input==='string'?input:(input&&input.url)||'';
        if(!init||typeof init.body!=='string'||!/\/v1\/chat\/completions(?:\?|$)/.test(target))return rawFetch(input,init);
        var cfg=null;
        try{if(typeof _activeCfg!=='undefined'&&_activeCfg&&_activeCfg.provider===ID&&_activeCfg.endpoint===target)cfg=_activeCfg}catch(_){}
        if(!cfg&&typeof _cfgs!=='undefined'&&Array.isArray(_cfgs))cfg=_cfgs.find(function(c){return c&&c.provider===ID&&c.endpoint===target})||null;
        if(!cfg)return rawFetch(input,init);
        var body=JSON.parse(init.body);
        if(!Array.isArray(body.messages))return rawFetch(input,init);
        var same=typeof _activeCfg!=='undefined'&&_activeCfg&&_activeCfg.id===cfg.id;
        var tid=same&&typeof _activeThread!=='undefined'&&_activeThread&&_activeThread.id?String(_activeThread.id):'main';
        var system=body.messages.find(function(m){return m.role==='system'});
        body.conversation_id='ibcy:'+String(cfg.id)+':'+tid;
        body.identity_id=localStorage.getItem('ibcy.identity_id')||'yingying';
        body.prompt_blocks={identity:String(cfg.systemPrompt||''),developer:String(system&&system.content||'')};
        body.metadata={client:'InternalBeyond-Mobile',friend_id:String(cfg.id),thread_id:tid};
        delete body.prompt_cache_key;
        delete body.stream_options;
        delete body.web_search_options;
        delete body.max_tokens;
        return rawFetch(input,Object.assign({},init,{body:JSON.stringify(body)}));
      }catch(err){console.warn('[IB Codex] request passthrough:',err);return rawFetch(input,init)}
    };
    fn.__ibNativeCodex=true;window.fetch=fn;
  }
  installFetchBridge();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
  else attach();
}());