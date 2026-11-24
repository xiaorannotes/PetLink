// Linux-only Electron/CDP smoke. ELECTRON_PATH may select an installed runtime.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(target){
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const pending=new Map();ws.onmessage=e=>{const data=JSON.parse(e.data);pending.get(data.id)?.(data);};
 return {capture:async file=>{const key=++id;const result=new Promise(resolve=>pending.set(key,resolve));ws.send(JSON.stringify({id:key,method:'Page.captureScreenshot',params:{format:'png'}}));const response=await result;await writeFile(file,Buffer.from(response.result.data,'base64'));},close:()=>ws.close(),evaluate:async expression=>{const key=++id;const result=new Promise(resolve=>pending.set(key,resolve));ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));const response=await result;assert.ok(!response.result.exceptionDetails,JSON.stringify(response));return response.result.result.value;}};
}
const shots='docs/ui-shots3';await mkdir(shots,{recursive:true});
const secret='m6p2-local-mock-secret';let requests=[];
const mock=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;requests.push({url:req.url,auth:req.headers.authorization,body:JSON.parse(text)});await sleep(350);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'收到啦。我们一起慢慢把事情做好。\n（本地 mock 模型接口回复）'}}]}));});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const base=await mkdtemp('/tmp/petlink-m6p2-');
const child=spawn('xvfb-run',['-a',process.env.ELECTRON_PATH||'/tmp/petlink-electron42/electron','--no-sandbox','--user-data-dir='+base+'/electron','--remote-debugging-port=9342','apps/desktop'],{env:{...process.env,PETLINK_DATA_DIR:base,XDG_CONFIG_HOME:base+'/config',XDG_CACHE_HOME:base+'/cache'},stdio:'ignore',detached:true});
const clients=[];
try{
 let targets=[];for(let i=0;i<30;i++){await sleep(500);try{targets=await(await fetch('http://127.0.0.1:9342/json/list')).json();if(targets.some(t=>t.url.endsWith('control.html'))&&targets.some(t=>t.url.endsWith('pet.html')))break;}catch{}}
 const control=await connect(targets.find(t=>t.url.endsWith('control.html')));clients.push(control);
 await sleep(500);await control.evaluate(`document.getElementById('skip').click()`);await sleep(200);
 assert.equal(await control.evaluate(`document.getElementById('look-at-mouse').checked`),true);
 assert.equal((await control.evaluate(`window.petlink.call('snapshot')`)).settings.typingAutostart,false);
 await control.evaluate(`document.querySelector('[data-page="chat"]').click()`);
 assert.match(await control.evaluate(`document.getElementById('chat-view').textContent`),/先连接你的模型接口/);
 const blocked=await control.evaluate(`window.petlink.call('chat-send','unconfigured')`);assert.equal(blocked.ok,false);assert.equal(requests.length,0);
 await control.capture(shots+'/02-chat-guide.png');
 await control.evaluate(`document.querySelector('#chat-view button').click()`);await sleep(300);
 assert.equal(await control.evaluate(`document.getElementById('pets').hidden`),false);
 const endpoint=`http://127.0.0.1:${mock.address().port}/v1/chat/completions`;
 await control.evaluate(`document.getElementById('chat-url').value=${JSON.stringify(endpoint)};document.getElementById('chat-key').value=${JSON.stringify(secret)};document.getElementById('chat-model').value='local-mock';document.getElementById('chat-save').click()`);await sleep(300);
 assert.equal((await control.evaluate(`window.petlink.call('snapshot')`)).settings.chat.apiKey,'***');
 assert.equal(await control.evaluate(`document.getElementById('chat-key').value`),'');
 await control.evaluate(`document.getElementById('chat-settings').scrollIntoView()`);await control.capture(shots+'/04-chat-settings.png');
 const pet=await connect(targets.find(t=>t.url.endsWith('pet.html')));clients.push(pet);
 await pet.evaluate(`document.querySelector('img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await sleep(400);
 targets=await(await fetch('http://127.0.0.1:9342/json/list')).json();const mini=await connect(targets.find(t=>t.url.endsWith('chat.html')));clients.push(mini);assert.deepEqual(await mini.evaluate(`({width:outerWidth,height:outerHeight})`),{width:360,height:480});
 await mini.evaluate(`document.querySelector('textarea').value='今天也一起努力吧';document.querySelector('form').requestSubmit()`);
 await sleep(100);assert.equal((await control.evaluate(`window.petlink.call('snapshot')`)).chat.busy,true);
 await sleep(700);const state=await control.evaluate(`window.petlink.call('snapshot')`);assert.equal(state.chat.history.at(-1).role,'assistant');assert.match(state.chat.history.at(-1).content,/本地 mock/);assert.equal(requests.length,1);assert.equal(requests[0].auth,'Bearer '+secret);assert.equal(requests[0].body.model,'local-mock');assert.equal(requests[0].body.messages.at(-1).content,'今天也一起努力吧');
 await mini.capture(shots+'/03-chat-mini-mock.png');
 const history=JSON.parse(await readFile(base+'/chat-history.json','utf8'));assert.equal(history.length,2);
 await control.evaluate(`document.querySelector('[data-page="chat"]').click()`);assert.match(await control.evaluate(`document.getElementById('chat-view').textContent`),/本地 mock/);
 const {port}=JSON.parse(await readFile(base+'/hub.json','utf8'));const token=(await readFile(base+'/token','utf8')).trim();
 const response=await fetch(`http://127.0.0.1:${port}/v1/event`,{method:'POST',headers:{'content-type':'application/json','x-petlink-token':token},body:JSON.stringify({v:1,source:'typing',session:'smoke-helper',state:'working',count:37,ts:Date.now()})});assert.equal(response.status,200);
 await control.evaluate(`document.querySelector('[data-page="connections"]').click()`);await sleep(2300);
 assert.equal((await control.evaluate(`window.petlink.call('snapshot')`)).typing.today,37);assert.equal((await control.evaluate(`window.petlink.call('snapshot')`)).aggregate.state,'working');assert.match(await control.evaluate(`document.getElementById('overview').textContent`),/37/);assert.match(await control.evaluate(`document.getElementById('typing-card').textContent`),/已连接/);
 await control.capture(shots+'/01-connections-typing.png');
 const exported=await control.evaluate(`window.petlink.call('diagnostics')`);const diagnostics=JSON.stringify(exported);await writeFile(base+'/diagnostics.json',diagnostics);assert.ok(!diagnostics.includes(secret));assert.ok(!diagnostics.includes('今天也一起努力吧'));assert.equal(exported.chat.apiKey,'***');
 const boot=await readFile(path.join(path.dirname(process.env.ELECTRON_PATH||'/tmp/petlink-electron42/electron'),'boot.log'),'utf8');assert.ok(!boot.includes(secret));assert.ok(!boot.includes('今天也一起努力吧'));
 await control.evaluate(`window.petlink.call('settings',{lookAtMouse:false})`);assert.equal((await control.evaluate(`window.petlink.call('snapshot')`)).settings.lookAtMouse,false);
 await control.evaluate(`window.petlink.call('chat-clear')`);assert.deepEqual(JSON.parse(await readFile(base+'/chat-history.json','utf8')),[]);
 console.log(JSON.stringify({pass:true,base,unconfiguredBlocked:true,realFetchMock:true,sharedHistory:true,typingToday:37,lookToggle:true,diagnosticsMask:true,bootMask:true,screenshots:shots,windowsRun:false}));
}finally{for(const c of clients)c.close();process.kill(-child.pid,'SIGTERM');await new Promise(resolve=>mock.close(resolve));await sleep(500);}
