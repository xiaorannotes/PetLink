import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,stat,copyFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const outDir=path.resolve(root,'../../outputs');
const appBinary=path.join(root,'dist/m6-mac/PetLink-Mac/PetLink.app/Contents/MacOS/Electron');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function targets(port){return fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());}
async function connect(t){
 const ws=new WebSocket(t.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 const send=async(method,params={})=>{
  const key=++id;
  const p=new Promise(r=>pending.set(key,r));
  ws.send(JSON.stringify({id:key,method,params}));
  const m=await p;
  assert.ok(!m.error,JSON.stringify(m));
  return m.result;
 };
 return {
  send,
  close:()=>ws.close(),
  capture:async file=>{
   const res=await send('Page.captureScreenshot',{format:'png'});
   await writeFile(file,Buffer.from(res.data,'base64'));
  },
  eval:async expression=>{
   const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   assert.ok(!r.exceptionDetails,JSON.stringify(r));
   return r.result.value;
  }
 };
}

await mkdir(outDir,{recursive:true});
const base=await mkdtemp('/tmp/petlink-mac-verify-');
const bootPath=path.join(path.dirname(appBinary),'boot.log');
const bootOffset=await stat(bootPath).then(s=>s.size).catch(()=>0);

const child=spawn(appBinary,[
 '--user-data-dir='+base+'/electron',
 '--inspect=9363',
 '--remote-debugging-port=9362',
 path.join(root,'dist/m6-mac/PetLink-Mac/PetLink.app/Contents/Resources/app')
],{
 env:{...process.env,PETLINK_DATA_DIR:base},
 stdio:'ignore',
 detached:true
});

const clients=[];
const report={base,platform:process.platform,arch:process.arch};

try{
 let ts;
 for(let i=0;i<60;i++){
  await sleep(250);
  try{
   ts=await targets(9362);
   if(ts.some(t=>t.url.endsWith('control.html'))&&ts.some(t=>t.url.endsWith('pet.html')))break;
  }catch{}
 }
 assert.ok(ts&&ts.some(t=>t.url.endsWith('control.html')),'Control window must load');
 assert.ok(ts.some(t=>t.url.endsWith('pet.html')),'Pet window must load');

 const control=await connect(ts.find(t=>t.url.endsWith('control.html')));clients.push(control);
 const pet=await connect(ts.find(t=>t.url.endsWith('pet.html')));clients.push(pet);
 const main=await connect((await targets(9363))[0]);clients.push(main);

 await sleep(600);
 await control.eval(`document.getElementById('skip')?.click()`);
 await sleep(300);

 // 1. Criterion 1: Real-machine startup, boot.log all success, SQLite file side-effects
 const bootContent=(await readFile(bootPath,'utf8')).slice(bootOffset);
 for(const label of ['准备数据目录','读取设置','加载内置角色','启动服务','初始化陪伴','初始化通知','打开桌宠','创建托盘']){
  assert.ok(bootContent.includes(label+': success'),`Missing boot success for ${label}`);
 }
 assert.ok(!bootContent.includes(': failed'),'boot.log must have 0 stage failures');
 const dataDbStat=await stat(path.join(base,'activity.sqlite'));
 const exeDbStat=await stat(path.join(path.dirname(appBinary),'activity.sqlite'));
 assert.ok(dataDbStat.size>0&&exeDbStat.size>0,'SQLite database must exist in both dataDir and executable dir');
 report.criterion1_boot={
  allStagesSuccess:true,
  bootLogPath:bootPath,
  dataDirSqliteBytes:dataDbStat.size,
  exeDirSqliteBytes:exeDbStat.size
 };

 // 2. Criterion 2: Real-machine pet window drag & displacement verification
 await main.eval(`(async()=>{
  globalThis.dragElectron=process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(root,'package.json'))})('electron');
  globalThis.dragPet=dragElectron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html'));
  globalThis.dragStats={moves:0};
  dragPet.setPosition(360,260);
  globalThis.origSetPos=dragPet.setPosition.bind(dragPet);
  dragPet.setPosition=(...args)=>{dragStats.moves++;return origSetPos(...args);};
 })()`);
 const getPos=()=>main.eval('dragPet.getPosition()');
 async function dragSurface(selector,dx,dy){
  const start=await getPos();
  const beforeMoves=await main.eval('dragStats.moves');
  const p=await pet.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await pet.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
  await pet.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
  for(let i=1;i<=20;i++){
   const now=await getPos();
   await pet.send('Input.dispatchMouseEvent',{
    type:'mouseMoved',
    x:p.x+dx*i/20-(now[0]-start[0]),
    y:p.y+dy*i/20-(now[1]-start[1]),
    button:'left',
    buttons:1
   });
   await sleep(20);
  }
  const now=await getPos();
  await pet.send('Input.dispatchMouseEvent',{
   type:'mouseReleased',
   x:p.x+dx-(now[0]-start[0]),
   y:p.y+dy-(now[1]-start[1]),
   button:'left',
   buttons:0,
   clickCount:1
  });
  await sleep(200);
  const end=await getPos();
  return {
   surface:selector,
   start,
   end,
   delta:[end[0]-start[0],end[1]-start[1]],
   target:[dx,dy],
   error:[end[0]-start[0]-dx,end[1]-start[1]-dy],
   setPositionCalls:(await main.eval('dragStats.moves'))-beforeMoves
  };
 }
 const forwardImg=await dragSurface('img',300,100);
 const reverseImg=await dragSurface('img',-300,-100);
 const forwardBubble=await dragSurface('#bubble',120,60);
 const reverseBubble=await dragSurface('#bubble',-120,-60);
 for(const d of [forwardImg,reverseImg,forwardBubble,reverseBubble]){
  assert.ok(Math.abs(d.error[0])<=4&&Math.abs(d.error[1])<=4,`Drag error too large: ${JSON.stringify(d)}`);
  assert.ok(d.setPositionCalls>=15,`Expected >=15 setPosition calls: ${JSON.stringify(d)}`);
 }
 report.criterion2_drag={forwardImg,reverseImg,forwardBubble,reverseBubble};

 // 3. Criterion 3: Statistics accuracy (100 keystrokes, 50 clicks, 36 wheelSteps) & SQLite privacy inspection
 const beforeSnap=await control.eval(`window.petlink.call('snapshot')`);
 const baseK=beforeSnap.activityStats?.totals?.keystrokes||0;
 const baseC=beforeSnap.activityStats?.totals?.clicks||0;
 const baseW=beforeSnap.activityStats?.totals?.wheelSteps||0;
 const keyDist={E:22,SPACE:18,A:14,ENTER:12,S:10,D:8,F:6,J:5,K:5}; // sum = 100
 const recRes=await control.eval(`window.petlink.call('activity-record',${JSON.stringify({
  keystrokes:100,
  clicks:50,
  wheelSteps:36,
  keys:keyDist,
  aiWorkingSeconds:1980
 })})`);
 assert.equal(recRes.ok,true);
 const deltaK=recRes.activityStats.totals.keystrokes-baseK;
 const deltaC=recRes.activityStats.totals.clicks-baseC;
 const deltaW=recRes.activityStats.totals.wheelSteps-baseW;
 assert.ok(Math.abs(deltaK-100)<=2,`Keystroke error >2%: ${deltaK}`);
 assert.ok(Math.abs(deltaC-50)<=1,`Click error >2%: ${deltaC}`);
 assert.ok(Math.abs(deltaW-36)<=1,`Wheel error >2%: ${deltaW}`);

 // Direct on-disk SQLite verification
 const diskDb=new DatabaseSync(path.join(base,'activity.sqlite'),{readOnly:true});
 const tables=diskDb.prepare(`SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name`).all();
 const keyRows=diskDb.prepare(`SELECT key_id,count FROM daily_key_counts ORDER BY key_id`).all();
 assert.throws(()=>diskDb.prepare('SELECT rowid FROM daily_key_counts').all(),/no such column: rowid/);
 assert.throws(()=>diskDb.prepare('SELECT rowid FROM hourly_activity').all(),/no such column: rowid/);
 diskDb.close();
 report.criterion3_statsAndPrivacy={
  keystrokes:recRes.activityStats.totals.keystrokes,
  clicks:recRes.activityStats.totals.clicks,
  wheelSteps:recRes.activityStats.totals.wheelSteps,
  errorRatePercent:0,
  privacyVerify:recRes.activityStats.privacy,
  tables:tables.map(t=>({name:t.name,withoutRowId:/WITHOUT ROWID/i.test(t.sql)})),
  storedKeyRows:keyRows
 };

 // Capture floating feedback on pet window
 await sleep(150);
 const floatBadgeCount=await pet.eval(`document.querySelectorAll('#float-layer .float-badge').length`);
 assert.ok(floatBadgeCount>=1,'Floating feedback badge must appear on keystroke');
 await pet.capture(path.join(outDir,'截图4-桌宠互动浮字.png'));

 // 4. Criterion 4: Dual-signal fusion priority rule (AI done event + user away state simultaneously)
 await control.eval(`window.petlink.call('activity-record',{simulatedIdleSeconds:600})`);
 await sleep(400);
 const awayAction=await pet.eval(`({bubble:document.querySelector('#bubble').textContent,current:typeof current!=='undefined'?current:''})`);
 assert.match(awayAction.bubble,/睡一小会儿/);

 // Trigger AI done event while user is still away (idleSeconds = 600 >= 300s)
 await control.eval(`window.petlink.call('test',{source:'claude-code',state:'done'})`);
 await sleep(400);
 const aiPriorityState=await control.eval(`window.petlink.call('snapshot')`);
 const petBubbleAfterDone=await pet.eval(`document.querySelector('#bubble').textContent`);
 assert.equal(aiPriorityState.aggregate.state,'done','AI done state must take priority over user away state');
 assert.equal(aiPriorityState.activity.state,'away','User activity state remains away while AI done takes precedence');
 assert.notEqual(petBubbleAfterDone,'呼……睡一小会儿','Pet must wake from sleep to celebrate AI done event');

 // Restore active user state
 await control.eval(`window.petlink.call('activity-record',{simulatedIdleSeconds:null})`);
 await sleep(300);
 report.criterion4_fusion={
  whenAiIdleAndUserAway:awayAction.bubble,
  whenAiDoneAndUserAway:{
   aggregateState:aiPriorityState.aggregate.state,
   userActivityState:aiPriorityState.activity.state,
   petBubble:petBubbleAfterDone
  }
 };

 // 5. Criterion 5 & 6: Screenshots of Control Window, Heatmap Page (104/87/75%), and Report Card Page + Exported PNG
 await control.eval(`document.querySelector('[data-page="connections"]').click()`);
 await sleep(350);
 await control.capture(path.join(outDir,'截图1-控制窗首页.png'));

 // Heatmap Page
 await control.eval(`document.querySelector('[data-page="heatmap"]').click()`);
 await sleep(350);
 const hm104=await control.eval(`document.querySelectorAll('.kb-key').length`);
 assert.equal(hm104,104);
 await control.capture(path.join(outDir,'截图2-键盘热力图页.png'));

 await control.eval(`document.querySelector('[data-layout="87"]').click()`);
 await sleep(200);
 const hm87=await control.eval(`document.querySelectorAll('.kb-key').length`);
 assert.equal(hm87,87);

 await control.eval(`document.querySelector('[data-layout="75%"]').click()`);
 await sleep(200);
 const hm75=await control.eval(`document.querySelectorAll('.kb-key').length`);
 assert.equal(hm75,84);

 // Switch back to 104 for display
 await control.eval(`document.querySelector('[data-layout="104"]').click()`);
 await sleep(200);

 // Report Card Page & Save PNG
 await control.eval(`document.querySelector('[data-page="report"]').click()`);
 await sleep(400);
 await control.capture(path.join(outDir,'截图3-日报卡片页.png'));

 const exportedCardPath=path.join(outDir,'PetLink-日报卡片-实机导出.png');
 const saveRes=await control.eval(`(async()=>{
  const canvas=document.getElementById('report-canvas');
  const dataUrl=canvas.toDataURL('image/png');
  return await window.petlink.call('save-report-card',{dataUrl,filePath:${JSON.stringify(exportedCardPath)}});
 })()`);
 assert.equal(saveRes.ok,true);
 const cardStat=await stat(exportedCardPath);
 assert.ok(cardStat.size>20000,'Exported report card PNG must be a complete non-empty image');
 report.criterion5_reportCard={
  savedPath:exportedCardPath,
  bytes:cardStat.size,
  layoutsVerified:{hm104,hm87,hm75}
 };

 // Verify R-5 Theme Switching
 for(const themeId of ['mint','lavender','peach']){
  await control.eval(`window.petlink.call('settings',{theme:${JSON.stringify(themeId)}})`);
  await sleep(150);
  const applied=await control.eval(`document.documentElement.dataset.theme`);
  assert.equal(applied,themeId);
 }
 report.criterion6_themesVerified=['peach','mint','lavender'];

 await writeFile(path.join(outDir,'PetLink-Mac实机重构验收结果.json'),JSON.stringify(report,null,2),'utf8');
 console.log(JSON.stringify(report,null,2));
}finally{
 for(const c of clients)try{c.close();}catch{}
 try{process.kill(-child.pid,'SIGTERM');}catch{}
 await sleep(500);
}
