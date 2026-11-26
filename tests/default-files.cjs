const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const api=require('../default-files.js');
const initial=JSON.parse(fs.readFileSync(path.join(__dirname,'../default-files.json'),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=bytes=>crypto.createHash('sha1').update(bytes).digest('hex');
const blobHash=bytes=>digest(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]));
function repo(){
 let counter=0,head;const blobs=new Map(),trees=new Map(),commits=new Map(),calls=[];
 const state={calls,blobs,trees,commits,onPatch:null,afterPatchLost:false,denyWrites:false};
 function addBlob(bytes){const b=Buffer.from(bytes),sha=blobHash(b);blobs.set(sha,b);return sha;}
 function commitFiles(files,parent){const tree=digest(Buffer.from(JSON.stringify([...files])+ ++counter));trees.set(tree,new Map(files));const sha=digest(Buffer.from('commit '+tree+' '+ ++counter));commits.set(sha,{tree:{sha:tree},parents:parent?[parent]:[]});return sha;}
 const originalFiles=new Map(initial.files.map(f=>[f.path,addBlob(Buffer.from('한국어\tEnglish\n'+f.name+'\tSample'))]));
 originalFiles.set('default-files.json',addBlob(Buffer.from(JSON.stringify(initial))));originalFiles.set('index.html',addBlob(Buffer.from('unchanged app')));head=commitFiles(originalFiles);
 Object.defineProperty(state,'head',{get(){return head}});
 state.files=()=>trees.get(commits.get(head).tree.sha);
 state.catalog=()=>JSON.parse(blobs.get(state.files().get('default-files.json')).toString());
 state.externalChange=edit=>{const files=new Map(state.files());edit(files,addBlob);head=commitFiles(files,head);};
 const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>clone(data),arrayBuffer:async()=>{const b=Buffer.from(data);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
 state.fetch=async(url,options={})=>{
  const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;calls.push({url,method,body,headers:options.headers||{}});
  if(url.startsWith('https://raw.githubusercontent.com/')){
   assert.equal(options.headers?.Authorization,undefined,'never send a token to raw downloads');
   if(state.rawFails)return response(404,{});
   const parts=new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent),ref=parts[2],file=parts.slice(3).join('/');
   const commit=commits.get(ref==='main'?head:ref),sha=commit&&trees.get(commit.tree.sha).get(file);
   return sha?response(200,blobs.get(sha)):response(404,{});
  }
  const base='https://api.github.com/repos/narpheus-cpu/sol-flashcards';
  assert.ok(url===base||url.startsWith(base+'/'));
  assert.notEqual(url,base+'/','repository requests must omit the trailing slash');
  const endpoint=url===base?'':url.slice(base.length+1);
  if((method!=='GET'||endpoint==='')&&options.headers?.Authorization!=='Bearer unit-test-token')return response(401,{});
  if(state.denyWrites&&method!=='GET')return response(403,{});
  if(endpoint==='')return response(200,{permissions:{push:true}});
  if(endpoint==='git/ref/heads/main')return response(200,{object:{sha:head}});
  if(endpoint.startsWith('git/commits/')&&method==='GET')return response(200,commits.get(endpoint.split('/').pop()));
  if(endpoint.startsWith('git/trees/')&&method==='GET'){
   const tree=trees.get(endpoint.split('/').pop().split('?')[0]);return response(200,{truncated:false,tree:[...tree].map(([path,sha])=>({path,sha,type:'blob',size:blobs.get(sha).length}))});
  }
  if(endpoint.startsWith('git/blobs/')&&method==='GET'){const b=blobs.get(endpoint.split('/').pop());return response(200,{encoding:'base64',content:b.toString('base64')});}
  if(endpoint==='git/blobs'&&method==='POST'){const bytes=Buffer.from(body.content,body.encoding==='base64'?'base64':'utf8');return response(201,{sha:addBlob(bytes)});}
  if(endpoint==='git/trees'&&method==='POST'){
   const files=new Map(trees.get(body.base_tree));for(const entry of body.tree){if(entry.sha===null)files.delete(entry.path);else files.set(entry.path,entry.content!==undefined?addBlob(Buffer.from(entry.content)):entry.sha);}
   const sha=digest(Buffer.from(JSON.stringify([...files])+ ++counter));trees.set(sha,files);return response(201,{sha});
  }
  if(endpoint==='git/commits'&&method==='POST'){const sha=digest(Buffer.from(JSON.stringify(body)+ ++counter));commits.set(sha,{tree:{sha:body.tree},parents:body.parents});return response(201,{sha});}
  if(endpoint==='git/refs/heads/main'&&method==='PATCH'){
   assert.equal(body.force,false,'never overwrite concurrent changes');
   if(state.onPatch){const callback=state.onPatch;state.onPatch=null;callback();}
   if(commits.get(body.sha).parents[0]!==head)return response(422,{});
   head=body.sha;if(state.afterPatchLost){state.afterPatchLost=false;throw new TypeError('response lost');}
   return response(200,{object:{sha:head}});
  }
  throw new Error(method+' '+endpoint);
 };
 return state;
}
function file(name,bytes){const data=Buffer.from(bytes);return {name,size:data.length,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}
function authenticated(server){return api.client({fetch:server.fetch,getToken:()=> 'unit-test-token'});}

test('existing five defaults load without authentication',async()=>{
 const server=repo(),client=api.client({fetch:server.fetch});const snapshot=await client.snapshot();
 assert.deepEqual(snapshot.files.map(f=>f.name),initial.files.map(f=>f.name));
 assert.ok(server.calls.every(c=>!c.headers.Authorization));
 const data=await client.download(snapshot.files[0],snapshot.head);assert.ok(new TextDecoder().decode(data.buffer).includes('English'));
});
test('TXT and binary XLSX bytes are added with their catalog in one commit',async()=>{
 for(const [name,bytes] of [['새 문장.txt',Buffer.from('한글\tEnglish')],['정리.xlsx',Buffer.from([80,75,0,1,255,7,0])]]){
  const server=repo(),client=authenticated(server),before=server.head;
  const result=await client.upload(file(name,bytes),'새 기본 자료');
  const added=result.files.at(-1);assert.equal(added.name,'새 기본 자료');assert.equal(added.fileName,name);assert.match(added.path,/^default-files\//);
  assert.deepEqual(server.blobs.get(server.files().get(added.path)),bytes);
  assert.equal(server.catalog().files.at(-1).path,added.path);
  assert.equal(server.calls.filter(c=>c.method==='PATCH').length,1);
  assert.equal(server.commits.get(server.head).parents[0],before);
  const read=await client.download(added,result.head);assert.equal(read.fileName,name);assert.equal(read.title,'새 기본 자료');assert.deepEqual(Buffer.from(read.buffer),bytes);
 }
});
test('selected files are removed from Git and catalog without changing the app',async()=>{
 const server=repo(),client=authenticated(server),snapshot=await client.snapshot();const index=server.files().get('index.html');
 await client.remove([snapshot.files[0],snapshot.files[2]]);
 assert.equal(server.files().has(snapshot.files[0].path),false);assert.equal(server.files().has(snapshot.files[2].path),false);
 assert.equal(server.catalog().files.length,initial.files.length-2);assert.equal(server.files().get('index.html'),index);
 const next=await client.snapshot();await client.remove(next.files);assert.equal((await client.snapshot()).files.length,0,'empty catalog must not restore deleted seed files');
});
test('concurrent uploads are preserved and retried without a forced push',async()=>{
 const server=repo(),client=authenticated(server);
 server.onPatch=()=>server.externalChange((files,addBlob)=>{
  const data=server.catalog(),other={id:'other',name:'동시 추가',fileName:'other.txt',path:'default-files/other.txt'};
  files.set(other.path,addBlob(Buffer.from('other')));files.set('default-files.json',addBlob(Buffer.from(JSON.stringify({...data,files:[...data.files,other]}))));files.set('index.html',addBlob(Buffer.from('another code change')));
 });
 await client.upload(file('내 파일.txt','hello'),'내 파일');
 assert.ok(server.catalog().files.some(f=>f.id==='other'));assert.ok(server.catalog().files.some(f=>f.name==='내 파일'));
 assert.equal(server.blobs.get(server.files().get('index.html')).toString(),'another code change');assert.equal(server.calls.filter(c=>c.method==='PATCH').length,2);
});
test('a changed selected file is not deleted after a concurrent commit',async()=>{
 const server=repo(),client=authenticated(server),snapshot=await client.snapshot(),selected=snapshot.files[0];
 server.onPatch=()=>server.externalChange((files,addBlob)=>files.set(selected.path,addBlob(Buffer.from('changed by someone else'))));
 await assert.rejects(client.remove([selected]),/변경/);
 assert.equal(server.blobs.get(server.files().get(selected.path)).toString(),'changed by someone else');assert.ok(server.catalog().files.some(f=>f.id===selected.id));
});
test('a lost ref-update response is verified instead of creating a duplicate',async()=>{
 const server=repo(),client=authenticated(server);server.afterPatchLost=true;
 const result=await client.upload(file('test.txt','hello'),'한 번만 추가');assert.equal(result.head,server.head);
 assert.equal(server.calls.filter(c=>c.method==='PATCH').length,1);assert.equal(server.catalog().files.filter(f=>f.name==='한 번만 추가').length,1);
});
test('GitHub authentication is required for writes and permission failures do not publish',async()=>{
 const server=repo(),unauthorized=api.client({fetch:server.fetch});await assert.rejects(unauthorized.upload(file('a.txt','a')),/연결/);assert.equal(server.calls.length,0);
 const client=authenticated(server),head=server.head;server.denyWrites=true;
 await assert.rejects(client.upload(file('a.txt','a')),/권한/);assert.equal(server.head,head);
});
test('invalid files and protected paths cannot enter the write transaction',async()=>{
 const server=repo(),client=authenticated(server);
 await assert.rejects(client.upload(file('index.html','x')),/TXT/);await assert.rejects(client.upload(file('empty.txt','')),/바이트/);
 await assert.rejects(client.upload({name:'big.xlsx',size:api.MAX_BYTES+1}),/20MB/);assert.equal(server.calls.length,0);
 for(const value of ['index.html','README.md','default-files/../index.txt','default-files/../../README.txt','/default-files/a.txt','default-files\\a.txt'])assert.equal(api.validPath(value),false,value);
 assert.throws(()=>api.catalog({version:1,files:[{id:'x',name:'x',path:'index.html'}]}));
});
test('downloads fall back to the Git blob API without altering binary data',async()=>{
 const server=repo(),client=authenticated(server),bytes=Buffer.from([0,255,13,10,128,80,75]);const result=await client.upload(file('x.xlsx',bytes),'표');server.rawFails=true;
 const data=await client.download(result.files.at(-1),result.head);assert.deepEqual(Buffer.from(data.buffer),bytes);
});
test('ordinary mobile browsers do not receive desktop management controls',()=>{
 assert.equal(api.isPC({navigator:{userAgent:'Windows NT 10.0'}}),true);
 for(const env of [{AndroidHost:{},navigator:{}},{navigator:{userAgent:'Android'}},{navigator:{userAgent:'iPhone'}},{navigator:{userAgentData:{mobile:true}}},{navigator:{platform:'MacIntel',maxTouchPoints:5}}])assert.equal(api.isPC(env),false);
 let accessed=false;api.install({AndroidHost:{},document:{getElementById(){accessed=true}},navigator:{}});assert.equal(accessed,false);
});

class Element {
 constructor(tag,doc){this.tagName=tag;this.doc=doc;this.children=[];this.dataset={};this.value='';this.hidden=false;this.disabled=false;this.listeners={};this.classList={add:()=>{},contains:()=>false};}
 setAttribute(k,v){this[k]=v;if(k==='id')this.doc.ids.set(v,this);}
 append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
 replaceChildren(...items){this.children=[];this.append(...items);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 addEventListener(k,fn){this.listeners[k]=fn;}
 set textContent(v){this.text=String(v);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(x=>x.textContent).join('');}
 get selectedOptions(){const found=this.children.find(c=>c.value===this.value)||this.children.find(c=>c.selected);return found?[found]:this.children.slice(0,1);}
 showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}
}
function dom(server){
 const document={ids:new Map(),readyState:'complete',createElement(tag){return new Element(tag,this)},getElementById(id){return this.ids.get(id)}};
 document.body=new Element('body',document);document.documentElement=new Element('html',document);
 for(const id of ['presetUrlSelect','addDefaultFile','deleteDefaultFile','importLocalFile','defaultFilesStatus','viewWordManage']){const e=new Element(id==='presetUrlSelect'?'select':'button',document);e.id=id;document.ids.set(id,e);document.body.append(e);}
 const storage=new Map([['mobileQuizSlotNames_Final2','["내 슬롯"]'],['existing-study-data','preserve']]);
 const window={document,navigator:{userAgent:'Windows NT 10.0'},fetch:server.fetch,confirm:()=>true,Option:function(text,value){const e=new Element('option',document);e.textContent=text;e.value=value;return e;},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 const all=()=>{const out=[];function walk(e){out.push(e);e.children.forEach(walk)}walk(document.body);return out;};
 return {window,document,storage,all};
}
for(const native of [false,true])test((native?'APK':'PC')+' upload/delete dialogs preserve slots and never store tokens',async()=>{
 const server=repo(),ui=dom(server);
 if(native){ui.window.AndroidHost={request(){}};ui.window.navigator={userAgent:'Android; wv',userAgentData:{mobile:true}};}
 api.install(ui.window);
 const get=id=>ui.document.getElementById(id),button=text=>ui.all().find(e=>e.tagName==='button'&&e.textContent===text);
 assert.equal(get('addDefaultFile').hidden,false);assert.equal(get('deleteDefaultFile').hidden,false);assert.equal(get('importLocalFile').textContent,'파일 직접 불러오기');
 await get('addDefaultFile').onclick();const selected=ui.all().find(e=>e.type==='file');selected.files=[file('학습.csv','한국어,English')];selected.onchange();
 const token=get('defaultGithubToken');token.value='unit-test-token';await button('GitHub 연결').onclick();assert.equal(token.value,'');
 await button('기본 파일 추가').onclick();
 const select=get('presetUrlSelect'),option=select.children.find(e=>e.textContent==='학습');assert.ok(option);select.value=option.value;
 const downloaded=await ui.window.SolDefaultFiles.readSelected();assert.equal(downloaded.fileName,'학습.csv');assert.equal(downloaded.title,'학습');
 await get('deleteDefaultFile').onclick();const checkbox=ui.all().filter(e=>e.type==='checkbox').at(-1);checkbox.checked=true;checkbox.onchange();await button('선택한 기본 파일 삭제').onclick();
 assert.equal(select.children.some(e=>e.textContent==='학습'),false);
 assert.equal(ui.storage.get('mobileQuizSlotNames_Final2'),'["내 슬롯"]');assert.equal(ui.storage.get('existing-study-data'),'preserve');
 assert.ok([...ui.storage.values()].every(v=>!v.includes('unit-test-token')));
});
test('three equal-width PC actions, original import and cache updates are wired into the page',()=>{
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),style=fs.readFileSync(path.join(__dirname,'../default-files.css'),'utf8'),sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
 assert.match(index,/id="importLocalFile"[\s\S]*id="addDefaultFile"[\s\S]*id="deleteDefaultFile"/);
 assert.match(style,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(index,/selected\.buffer; rawFileName = selected\.fileName; cleanFileName = selected\.title/);
 for(const file of ['default-files.js','default-files.css','default-files.json'])assert.ok(sw.includes(file));
 assert.match(sw,/solmate-shell-v\d+/);
});
test('a slow older catalog response cannot remove a newly uploaded option',async()=>{
 const server=repo(),ui=dom(server);let release,blocked=false;
 ui.window.fetch=async(url,options)=>{const response=await server.fetch(url,options);if(!blocked&&url.includes('/git/commits/')&&(!options||options.method==='GET')){blocked=true;await new Promise(resolve=>{release=resolve;});}return response;};
 api.install(ui.window);
 const refresh=ui.window.SolDefaultFiles.refresh(true);
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 const get=id=>ui.document.getElementById(id),button=text=>ui.all().find(e=>e.tagName==='button'&&e.textContent===text);
 await get('addDefaultFile').onclick();const selected=ui.all().find(e=>e.type==='file');selected.files=[file('새 자료.txt','한글\tEnglish')];selected.onchange();
 get('defaultGithubToken').value='unit-test-token';await button('GitHub 연결').onclick();await button('기본 파일 추가').onclick();
 release();await refresh;assert.ok(get('presetUrlSelect').children.some(e=>e.textContent==='새 자료'));
});
test('downloaded default titles render as text in slot cards',async()=>{
 const vm=require('node:vm'),index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const start=index.indexOf('    async function renderSlotCards('),end=index.indexOf('    async function handleParsedRows(',start),card={innerHTML:''};
 const env={getSlotStats:async()=>[1,0,0,0,0],slotNames:['<img src=x onerror=alert(1)>','A & B','셋','넷','다섯'],document:{getElementById:()=>card}};
 vm.runInNewContext(index.slice(start,end),env);await env.renderSlotCards('slotCardsContainer');
 assert.ok(card.innerHTML.includes('&lt;img'));assert.ok(card.innerHTML.includes('A &amp; B'));assert.ok(!card.innerHTML.includes('<img'));
});

