import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile('custom/ib-codex-provider.js','utf8');
const ENDPOINT='https://codex-gateway-v2-production.up.railway.app/v1/chat/completions';
const providerList={anthropic:{endpoint:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-6'},custom:{endpoint:'',model:''}};
const nodes=new Map(),requests=[],writes=[];
function node(id){
  if(nodes.has(id))return nodes.get(id);
  const el={
    id,value:'',style:{},dataset:{},textContent:'',classList:{toggle(){},contains(){return false}},
    handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},
    closest(){return labelGroup;},insertAdjacentElement(){},
    querySelector(){return null;},appendChild(){},insertBefore(){},
    set innerHTML(v){this._html=v},get innerHTML(){return this._html||''}
  };
  nodes.set(id,el);return el;
}
const label=node('label');
const labelGroup={querySelector(s){return s==='label'?label:null},insertAdjacentElement(where,el){assert.equal(where,'afterend');nodes.set(el.id,el)}};
const sel=node('aset-provider');
sel.value='anthropic';
sel.options=[];
sel.querySelector=(selector)=>selector.includes('custom')?node('custom-option'):null;
sel.insertBefore=(option)=>sel.options.push(option);
sel.appendChild=(option)=>sel.options.push(option);
node('aset-endpoint').value=providerList.anthropic.endpoint;
node('aset-model').value=providerList.anthropic.model;
const fakeDocument={
  readyState:'complete',
  getElementById:node,
  createElement:()=>node('created-'+nodes.size),
  addEventListener(){}
};
const local=new Map([
  ['ibcy.gateway.settings.v1',JSON.stringify({
    endpoint:ENDPOINT,token:'pairing-example',model:'gpt-5.6-terra'
  })],
  ['ibcy.identity_id','yingying']
]);
let nativeConfig={id:'cy_codex_chen',provider:'custom',subscriptionGateway:true,model:'gpt-5.6-terra',apiKey:'pairing-example',endpoint:ENDPOINT,systemPrompt:'persona'};
const context={
  PROVIDERS:providerList,
  document:fakeDocument,
  window:{fetch:async (url,init)=>{requests.push({url,init});return{ok:true,status:200,json:async()=>({logged_in:true,account:{plan:'Plus'}})}}},
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
  Headers, URL,console,
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
  dbGetAll:async ()=>[nativeConfig],
  dbPut:async (_store,cfg)=>{writes.push({...cfg});nativeConfig=cfg},
  loadCfgs:async ()=>{},
  _cfgs:[{id:'cy_codex_chen',provider:'codex',apiKey:'pairing-example',endpoint:ENDPOINT,systemPrompt:'persona',streaming:false}],
  _activeCfg:{id:'cy_codex_chen',provider:'codex',apiKey:'pairing-example',endpoint:ENDPOINT,systemPrompt:'persona',streaming:false},
  _activeThread:{id:'thread-1'}
};
vm.runInNewContext(source,context,{filename:'custom/ib-codex-provider.js'});
assert.ok(providerList.codex,'native PROVIDERS missing Codex');
assert.equal(sel.options[0].value,'codex','must be inserted in native supplier selector');
assert.ok(node('ib-codex-native').innerHTML.includes('登录 ChatGPT'),'native settings lack login action');
sel.value='codex';
sel.handlers.change();
assert.equal(node('aset-endpoint').value,ENDPOINT);
assert.equal(node('aset-key').value,'pairing-example');
assert.equal(node('aset-model').value,'gpt-5.6-terra');
assert.equal(label.textContent,'网关配对口令（不是 OpenAI API Key）');
await context.window.fetch(ENDPOINT,{
  method:'POST',
  headers:{Authorization:'Bearer pairing-example'},
  body:JSON.stringify({
    model:'gpt-5.6-terra',
    messages:[{role:'system',content:'system context'},{role:'user',content:'hi'}],
    stream:false,
    max_tokens:4096
  })
});
const payload=JSON.parse(requests.at(-1).init.body);
assert.equal(payload.conversation_id,'ibcy:cy_codex_chen:thread-1');
assert.equal(payload.identity_id,'yingying');
assert.equal(payload.prompt_blocks.identity,'persona');
assert.equal(payload.prompt_blocks.developer,'system context');
assert.ok(!('max_tokens' in payload),'should not leak OpenAI-only output options to gateway');
await Promise.resolve();await Promise.resolve();await Promise.resolve();
assert.equal(writes[0].provider,'codex','legacy profile must be migrated in place');
assert.equal(writes[0].id,'cy_codex_chen','original conversation friend ID must survive');
assert.equal(writes[0].streaming,false);
console.log('Native IB supplier registration, login UI, Codex payload and legacy profile migration passed');
