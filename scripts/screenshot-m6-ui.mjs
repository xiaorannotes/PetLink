// Linux-only Electron/CDP smoke. ELECTRON_PATH may select an installed runtime.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(target){
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const pending=new Map();ws.onmessage=e=>{const data=JSON.parse(e.data);pending.get(data.id)?.(data);};
 return {capture:async file=>{const key=++id;const result=new Promise(resolve=>pending.set(key,resolve));ws.send(JSON.stringify({id:key,method:'Page.captureScreenshot',params:{format:'png'}}));const response=await result;await writeFile(file,Buffer.from(response.result.data,'base64'));},close:()=>ws.close(),evaluate:async expression=>{const key=++id;const result=new Promise(resolve=>pending.set(key,resolve));ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));const response=await result;assert.ok(!response.result.exceptionDetails,JSON.stringify(response));return response.result.result.value;}};
}
await mkdir('docs/ui-shots2',{recursive:true});
for(const scenario of ['clean']){
 const base=await mkdtemp('/tmp/petlink-m6-');
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
  await control.evaluate(`document.getElementById('skip').click()`);await sleep(400);
  await control.capture('docs/ui-shots2/01-connections.png');await pet.capture('docs/ui-shots2/05-pet-idle.png');
  const interaction=await pet.evaluate(`(()=>{const img=document.querySelector('img');img.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,screenX:10,screenY:10}));img.dispatchEvent(new PointerEvent('pointerup'));return {pat:document.querySelector('#bubble').textContent,loaded:img.complete&&img.naturalWidth>0};})()`);
  assert.equal(interaction.pat,'摸摸收到啦');assert.equal(interaction.loaded,true);
  await pet.evaluate(`window.m6PlayFailures=[];const originalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return originalPlay.call(this).catch(e=>{window.m6PlayFailures.push(String(e));throw e;});};window.m6Plays=[];window.petlink.onPlay(e=>window.m6Plays.push(e));window.m6Errors=[];window.addEventListener('error',e=>window.m6Errors.push(e.message));`);
  await control.evaluate(`document.querySelector('[data-page="companion"]').click()`);
  const initial=await control.evaluate(`window.petlink.call('snapshot')`);
  assert.equal(initial.companion.balance,2);assert.equal(initial.companion.todayCompanionship,2);
  await control.evaluate(`Array.from(document.querySelectorAll('#shop article')).find(p=>p.textContent.startsWith('白米饭')).querySelector('button').click()`);
  await sleep(500);
  const bought=await control.evaluate(`window.petlink.call('snapshot')`);
  assert.equal(bought.companion.balance,0);assert.equal(bought.companion.backpack.rice,1);
  await control.evaluate(`document.querySelector('#backpack button').click()`);await sleep(500);
  const fed=await control.evaluate(`window.petlink.call('snapshot')`);
  assert.equal(fed.companion.backpack.rice,0);assert.ok(fed.companion.hunger>99);
  assert.equal(fed.companion.ledger.at(-1).kind,'feeding');
  await control.capture('docs/ui-shots2/02-companion.png');
  assert.equal(await pet.evaluate(`window.m6Plays.at(-1).id`),'eat-bowl');
  const playing=await pet.evaluate(`({failures:window.m6PlayFailures,src:document.querySelector('video').src,hidden:document.querySelector('video').hidden,time:document.querySelector('video').currentTime,error:document.querySelector('video').error?.message})`);
  await pet.capture('docs/ui-shots2/06-pet-eating.png');
  assert.equal(playing.hidden,false,JSON.stringify(playing));assert.ok(playing.time>0,JSON.stringify(playing));
  await control.evaluate(`document.querySelector('[data-page="actions"]').click();Array.from(document.querySelectorAll('#action-list button')).find(b=>b.textContent==='eat-noodles').click()`);
  await sleep(500);await control.capture('docs/ui-shots2/03-actions.png');await control.evaluate(`document.querySelector('[data-page="pets"]').click()`);await control.capture('docs/ui-shots2/04-pets.png');assert.equal(await pet.evaluate(`window.m6Plays.at(-1).id`),'eat-noodles');
  await sleep(5500);assert.equal(await pet.evaluate(`document.querySelector('video').hidden`),true);
  // Force decoder failure and verify both fallback frames and automatic recovery.
  await control.evaluate(`window.petlink.call('play',{type:'clip',id:'eat-candy'})`);
  await pet.evaluate(`document.querySelector('video').dispatchEvent(new Event('error'))`);
  await sleep(200);assert.match(await pet.evaluate(`document.querySelector('img').src`),/eat-candy\/static-0000.webp$/);
  await sleep(2600);assert.match(await pet.evaluate(`document.querySelector('img').src`),/eat-candy\/static-0075.webp$/);
  await sleep(2600);assert.match(await pet.evaluate(`document.querySelector('img').src`),/frames\/idle\//);
  await control.evaluate(`window.petlink.call('play',{type:'state',id:'waiting',index:0})`);
  await sleep(250);const frame1=await pet.evaluate(`document.querySelector('img').src`);await sleep(250);const frame2=await pet.evaluate(`document.querySelector('img').src`);assert.notEqual(frame1,frame2);assert.match(frame1,/frames\/waiting\//);
  await control.evaluate(`window.petlink.call('test',{source:'generic'})`);await sleep(200);
  assert.equal((await control.evaluate(`window.petlink.call('snapshot')`)).companion.balance,0);
  assert.deepEqual(await pet.evaluate(`window.m6Errors`),[]);
  console.log(JSON.stringify({economy:{initial:initial.companion.balance,bought:bought.companion.balance,portionsBefore:bought.companion.backpack.rice,portionsAfter:fed.companion.backpack.rice,hungerBefore:initial.companion.hunger,hungerAfter:fed.companion.hunger},clip:'eat-noodles',playing,fallback:true,stateAnimation:true,syntheticRewardExcluded:true}));
  await sleep(1000);assert.equal(child.exitCode,null);
  const log=(await readFile(path.join(path.dirname(process.env.ELECTRON_PATH||'/tmp/petlink-electron42/electron'),'boot.log'),'utf8')).split('[boot] entry').at(-1);
  for(const label of ['准备数据目录','读取设置','加载内置角色','启动服务','初始化陪伴','初始化通知','打开桌宠','创建托盘'])assert.ok(log.includes(label+': success'),label);
  if(scenario==='clean')assert.ok(!log.includes(': failed'));else assert.ok(log.includes('加载用户角色 broken: failed'));
  console.log(JSON.stringify({scenario,base,...page,interaction,stagesVerified:true,alive:true}));
 }finally{for(const client of clients)client.close();process.kill(-child.pid,'SIGTERM');await sleep(1000);}
}
