const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',source=fs.readFileSync(root+'sw.js','utf8'),html=fs.readFileSync(root+'index.html','utf8');
const base='https://narpheus-cpu.github.io/sol-flashcards/',listeners=new Map(),cached=new Map(),requests=[];
let online=true;
const cache={async match(req,options){const url=typeof req==='string'?req:req.url;return cached.get(url)?.clone();},async put(req,response){cached.set(typeof req==='string'?req:req.url,response.clone());}};
const context={URL,Request,Response,importScripts(){},self:{location:{href:base+'sw.js'},addEventListener:(type,fn)=>listeners.set(type,fn)},caches:{open:async()=>cache},fetch:async req=>{requests.push(req);if(!online)throw Error('offline');return new Response('fresh controls');}};
vm.runInNewContext(source,context);
async function request(path){let promise;listeners.get('fetch')({request:new Request(base+path),respondWith:value=>promise=value});return await promise;}
(async()=>{
 cached.set(base+'pc-quiz-controls.js?v=3',new Response('stale controls'));
 let response=await request('pc-quiz-controls.js?v=3');assert.equal(await response.text(),'fresh controls');assert.equal(requests.at(-1).cache,'no-cache');console.log('PASS online PC controls replace cached code before it can handle keys');
 online=false;response=await request('pc-quiz-controls.js?v=3');assert.equal(await response.text(),'fresh controls');console.log('PASS the exact cached controls version still works offline');
 response=await request('pc-quiz-controls.js?v=4');assert.equal(response.status,503);console.log('PASS offline loading never substitutes controls from a different version');
 assert.ok(html.includes("script.src='./pc-quiz-controls.js?v=3'"));assert.ok(!html.includes("script.src='./pc-quiz.js"));assert.ok(source.includes("'./pc-quiz-controls.js?v=3'"));console.log('PASS the new filename bypasses old service workers that ignore version queries');
})().catch(error=>{console.error(error);process.exitCode=1});
