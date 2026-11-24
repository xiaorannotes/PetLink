// Synthetic CDP input + independent BrowserWindow measurements; not OS/Windows input.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function targets(port){return fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());}
async function connect(t){
 const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 const send=async(method,params={})=>{const key=++id;const p=new Promise(r=>pending.set(key,r));ws.send(JSON.stringify({id:key,method,params}));const m=await p;assert.ok(!m.error,JSON.stringify(m));return m.result;};
 return {send,close:()=>ws.close(),eval:async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r));return r.result.value;}};
}
const base=await mkdtemp('/tmp/petlink-drag-');
const bootPath=path.join(path.dirname(process.env.ELECTRON_PATH||'/tmp/petlink-electron42/electron'),'boot.log');
const bootOffset=await stat(bootPath).then(s=>s.size).catch(()=>0);
const child=spawn('xvfb-run',['-a','-s','-screen 0 1600x1200x24',process.env.ELECTRON_PATH||'/tmp/petlink-electron42/electron','--no-sandbox',...(process.env.DRAG_SCALE?['--force-device-scale-factor='+process.env.DRAG_SCALE]:[]),'--inspect=9353','--remote-debugging-port=9352','--user-data-dir='+base+'/electron','apps/desktop'],{env:{...process.env,PETLINK_DATA_DIR:base,XDG_CONFIG_HOME:base+'/config',XDG_CACHE_HOME:base+'/cache'},stdio:'ignore',detached:true});
const clients=[];let result={base,platform:process.platform,windowsConfirmed:false};
try{
 let ts;for(let i=0;i<60;i++){await sleep(250);try{ts=await targets(9352);if(ts.some(t=>t.url.endsWith('pet.html')))break;}catch{}}
 const pet=await connect(ts.find(t=>t.url.endsWith('pet.html')));clients.push(pet);
 await sleep(700);
 const main=await connect((await targets(9353))[0]);clients.push(main);
 await main.eval(`(async()=>{globalThis.dragElectron=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron');globalThis.dragPet=dragElectron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html'));globalThis.dragStats={moves:0};dragPet.setPosition(400,300);})()`);
 result.regions=await pet.eval(`Object.fromEntries(['main','img','#bubble'].map(s=>[s,getComputedStyle(document.querySelector(s)).getPropertyValue('-webkit-app-region')]))`);
 assert.deepEqual(result.regions,{main:'drag',img:'no-drag','#bubble':'no-drag'});
 // Observe command arrival independently in main without replacing the handlers.
 await main.eval(`globalThis.dragCommands=[];dragElectron.Menu.prototype.popup=function(options){dragCommands.push('menu');options?.callback?.();};`);
 // invoke handlers are not EventEmitter listeners: wrap setPosition to count actual applications.
 await main.eval(`globalThis.originalDragSet=dragPet.setPosition.bind(dragPet);dragPet.setPosition=(...args)=>{dragStats.moves++;return originalDragSet(...args)};`);
 await pet.eval(`globalThis.dragEvents={dragstart:0,pointermove:0,pointercancel:0,pointerup:0};globalThis.dragPoints=[];document.addEventListener('pointermove',e=>dragPoints.push([e.screenX,e.screenY,e.clientX,e.clientY]),true);for(const name of Object.keys(dragEvents))document.addEventListener(name,()=>dragEvents[name]++,true);`);
 if(process.env.DRAG_DISABLE_NATIVE==='1')await pet.eval(`document.querySelector('img').draggable=false;document.querySelector('img').style.webkitUserDrag='none';document.addEventListener('dragstart',e=>e.preventDefault());`);
 const pos=()=>main.eval('dragPet.getPosition()');
 async function drag(dx,dy){
  const start=await pos();const before=await main.eval('dragStats.moves');
  const p=await pet.eval(`(()=>{const r=document.querySelector('img').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await pet.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
  await pet.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
  // CDP coordinates are viewport CSS pixels. Compensate for actual OS window
  // movement so the injected pointer follows a straight line on the desktop.
  for(let i=1;i<=20;i++){const now=await pos();await pet.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*i/20-(now[0]-start[0]),y:p.y+dy*i/20-(now[1]-start[1]),button:'left',buttons:1});await sleep(Number(process.env.DRAG_STEP_MS||25));}
  const now=await pos();await pet.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx-(now[0]-start[0]),y:p.y+dy-(now[1]-start[1]),button:'left',buttons:0,clickCount:1});await sleep(250);
  const end=await pos();return {start,end,target:[dx,dy],delta:end.map((v,i)=>v-start[i]),error:end.map((v,i)=>v-start[i]-[dx,dy][i]),setPositionCalls:(await main.eval('dragStats.moves'))-before};
 }
 result.forward=await drag(300,100);result.reverse=await drag(-300,-100);result.events=await pet.eval('dragEvents');if(process.env.DRAG_TRACE==='1')result.points=await pet.eval('dragPoints');result.devicePixelRatio=await pet.eval('devicePixelRatio');result.display=await main.eval('dragElectron.screen.getDisplayMatching(dragPet.getBounds())');
 // CDP exercises Chromium delivery on the image and bubble no-drag islands.
 // It cannot establish OS hit-testing of the native drag surface.
 async function click(selector,button,clickCount){
  const p=await pet.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await pet.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button,buttons:button==='right'?2:1,clickCount});
  await pet.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button,buttons:0,clickCount});await sleep(150);
 }
 await click('img','left',1);
 assert.equal(await pet.eval(`document.querySelector('main').classList.contains('pat')`),true,'click pats');
 for(const selector of ['img','#bubble']){
  const before=await main.eval('dragCommands.length');await click(selector,'right',1);
  assert.equal(await main.eval('dragCommands.length'),before+1,selector+' contextmenu arrives at main');
 }
 await click('img','left',2);
 assert.equal(await main.eval(`dragElectron.BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().endsWith('chat.html'))`),true,'dblclick opens chat');
 result.interactions={pat:true,imageContextmenu:true,bubbleContextmenu:true,imageDblclick:true,input:'synthetic CDP; menu popup stubbed after command arrival'};
 const log=()=>readFile(bootPath).then(b=>b.subarray(bootOffset).toString());
 let lines=await log();
 for(const pattern of [/\[drag\] startup.*scaleFactor.*initialBounds/,/\[drag\] renderer .*pointerdown/,/\[drag\] main command=move .*position/,/\[drag\] main command=menu/,/\[drag\] main command=chat-open/,/\[drag\] renderer .*contextmenu/,/\[drag\] renderer .*dblclick/])assert.match(lines,pattern);
 // Prove renderer + main share one hard cap, including startup.
 await pet.eval(`for(let i=0;i<100;i++)window.petlink.dragLog({event:'pointerup',target:'img',screenX:0,screenY:0})`);
 await sleep(200);lines=await log();result.dragLogLines=lines.split('\n').filter(l=>l.includes('[drag]')).length;
 assert.equal(result.dragLogLines,60);
 result.pass=[result.forward,result.reverse].every(r=>r.error.every(v=>Math.abs(v)<=8));console.log(JSON.stringify(result));assert.equal(result.events.dragstart,0);assert.equal(result.events.pointerup,2);assert.equal(result.events.pointercancel,0);assert.ok(result.reverse.end.every((v,i)=>Math.abs(v-result.forward.start[i])<=8),'return within 8px of origin');assert.ok([result.forward,result.reverse].every(r=>r.setPositionCalls>1),'window follows during drag');assert.ok(result.pass,'BrowserWindow drag delta must be within 8px each axis in both directions');
}finally{for(const c of clients)c.close();process.kill(-child.pid,'SIGTERM');await sleep(500);}
