// Linux-only Electron/CDP smoke. ELECTRON_PATH may select an installed runtime.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(target){
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const pending=new Map();ws.onmessage=e=>{const data=JSON.parse(e.data);pending.get(data.id)?.(data);};
 return {close:()=>ws.close(),evaluate:async expression=>{const key=++id;const result=new Promise(resolve=>pending.set(key,resolve));ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));const response=await result;assert.ok(!response.result.exceptionDetails,JSON.stringify(response));return response.result.result.value;}};
}
for(const scenario of ['clean','corrupted-user-character']){
 const base=await mkdtemp('/tmp/petlink-m5-1-');
 if(scenario!=='clean')await mkdir(base+'/characters/broken',{recursive:true});
 const child=spawn('xvfb-run',['-a',process.env.ELECTRON_PATH||'/tmp/petlink-electron42/electron','--no-sandbox','--user-data-dir='+base+'/electron','--remote-debugging-port=9339','apps/desktop'],{env:{...process.env,PETLINK_DATA_DIR:base,XDG_CONFIG_HOME:base+'/config',XDG_CACHE_HOME:base+'/cache'},stdio:'ignore',detached:true});
 const clients=[];
 try{
  let targets;
  for(let i=0;i<30;i++){await sleep(1000);try{targets=await(await fetch('http://127.0.0.1:9339/json/list')).json();if(targets.some(t=>t.url.endsWith('control.html'))&&targets.some(t=>t.url.endsWith('pet.html')))break;}catch{}}
  const control=await connect(targets.find(t=>t.url.endsWith('control.html')));clients.push(control);
  let page;
  for(let i=0;i<30;i++){page=await control.evaluate(`({title:document.title,cards:document.querySelectorAll('#tools article').length,bannerHidden:document.getElementById('boot-report')?.hidden,banner:document.getElementById('boot-report')?.textContent})`);if(page.cards===3&&(scenario==='clean'||!page.bannerHidden))break;await sleep(200);}
  assert.equal(page.cards,3);assert.equal(page.bannerHidden,scenario==='clean');
  if(scenario!=='clean'){assert.match(page.banner,/加载用户角色 broken/);assert.match(page.banner,/ENOENT/);assert.match(page.banner,/boot.log/);}
  const pet=await connect(targets.find(t=>t.url.endsWith('pet.html')));clients.push(pet);
  await sleep(500);
  const interaction=await pet.evaluate(`(()=>{const img=document.querySelector('img');img.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,screenX:10,screenY:10}));img.dispatchEvent(new PointerEvent('pointerup'));return {pat:document.querySelector('#bubble').textContent,loaded:img.complete&&img.naturalWidth>0};})()`);
  assert.equal(interaction.pat,'摸摸收到啦');assert.equal(interaction.loaded,true);
  await sleep(1000);assert.equal(child.exitCode,null);
  const log=(await readFile(path.join(path.dirname(process.env.ELECTRON_PATH||'/tmp/petlink-electron42/electron'),'boot.log'),'utf8')).split('[boot] entry').at(-1);
  for(const label of ['准备数据目录','读取设置','加载内置角色','启动服务','初始化通知','打开桌宠','创建托盘'])assert.ok(log.includes(label+': success'),label);
  if(scenario==='clean')assert.ok(!log.includes(': failed'));else assert.ok(log.includes('加载用户角色 broken: failed'));
  console.log(JSON.stringify({scenario,base,...page,interaction,stagesVerified:true,alive:true}));
 }finally{for(const client of clients)client.close();process.kill(-child.pid,'SIGTERM');await sleep(1000);}
}
