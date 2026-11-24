import {existsSync} from 'node:fs';
import {feedingMenu} from './feeding-menu.mjs';
import {diagnostics} from './diagnostics.mjs';
import {createRequire} from 'node:module';
import {startEmbeddedTyping} from '../../packages/typing/embedded.mjs';
import {createActivityStore,startActivityCollector} from '../../packages/activity/index.mjs';
import {THEME_IDS} from './themes.mjs';
import {HEATMAP_PALETTES,KEYBOARD_LAYOUTS} from './heatmap-view.mjs';
import {createChat,DEFAULT_PROMPT,validateChat,redact} from './chat.mjs';
import {app,BrowserWindow,Tray,Menu,Notification,ipcMain,dialog,nativeImage,screen,shell,powerMonitor,clipboard} from 'electron';
import {createBootLogger} from './boot-log.mjs';
import {createStageRunner,bootSnapshot,canCreatePet,finishBoot} from './boot.mjs';
import {readFile,writeFile,mkdir,access,realpath,cp} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startHub,defaultDataDir} from '../../packages/hub/index.mjs';
import {startLocalSessions} from '../../packages/adapters/local-sessions.mjs';
import {startAutoDetector,AGENT_DEFINITIONS,detectInstalledPaths} from '../../packages/adapters/auto-detector.mjs';
import {createNotifier,isQuietHour} from '../../packages/notifier/index.mjs';
import {createConfigManager as claude} from '../../packages/config-manager/index.mjs';
import {createConfigManager as codex} from '../../packages/config-manager/codex-hooks.mjs';
import {createConfigManager as antigravity} from '../../packages/config-manager/antigravity-hooks.mjs';
import {createConfigManager as cursor} from '../../packages/config-manager/cursor-hooks.mjs';
import {createCompanion} from '../../packages/companion/index.mjs';
import {randomUUID} from 'node:crypto';
import {validateManifest} from './character.mjs';
let logSecrets=[];
const bootLog=createBootLogger(app,dialog,{secrets:()=>logSecrets});
let dragLines=0,dragMoves=0;
function dragLog(message){if(dragLines>=60)return;dragLines++;bootLog('[drag] '+message);}
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const appIcon=path.join(root,'assets',process.platform==='win32'?'app-icon.ico':'app-icon.png');
if(process.platform==='win32')app.setAppUserModelId('petlink.desktop');
const dataDir=process.env.PETLINK_DATA_DIR||defaultDataDir();
let settings={
 mode:'companion',
 theme:'lavender',
 clickThrough:false,
 typingFloatEnabled:true,
 heatmapLayout:'104',
 heatmapPalette:'peach',
 heatmapCustomLow:'#FDE8EE',
 heatmapCustomHigh:'#E04F70',
 lookAtMouse:true,
 typingEnabled:true,
 typingAutostart:false,
 chat:{url:'',apiKey:'',model:'',prompt:DEFAULT_PROMPT},
 scale:1,
 opacity:1,
 sound:true,
 alwaysOnTop:true,
 quietHours:{start:'22:30',end:'07:00'},
 notifications:['waiting','done','error'],
 webhookEnabled:false,
 webhookUrl:'',
 webhookHeaders:{},
 onboarded:false,
 character:'xiaodada',
 enabledAgents:['antigravity','claude-code','codex','cursor','deepseek','doubao-pro','muse','grokbot','workbuddy']
};
let chat,chatWindow,chatDoneUntil=0;
let companion,activityStore=null,autoDetector=null,controlPage=null,controlPageRequest=0;
let hub,pet,control,tray,notifier,characters=[],closing=false;
const nodeRuntime=(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,process.platform==='win32'?'node.exe':'node')).find(file=>existsSync(file))||'node';
const managers={
 antigravity:antigravity({dataDir,nodePath:nodeRuntime,adapterPath:path.join(dataDir,'integrations/packages/adapters/antigravity.mjs')}),
 'claude-code':claude({dataDir,nodePath:nodeRuntime,adapterPath:path.join(dataDir,'integrations/packages/adapters/claude-code.mjs')}),
 codex:codex({dataDir,nodePath:nodeRuntime,adapterPath:path.join(dataDir,'integrations/packages/adapters/codex.mjs')}),
 cursor:cursor({dataDir,nodePath:nodeRuntime,adapterPath:path.join(dataDir,'integrations/packages/adapters/cursor.mjs')})
};
async function loadCharacter(folder){
 const base=await realpath(folder),manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
 const errors=validateManifest(manifest);if(errors.length)throw Error(errors.join('；'));
 const files=[...Object.values(manifest.states).flatMap(actions=>actions.flatMap(a=>a.frames)),...Object.values(manifest.clips||{}).flatMap(c=>[c.file,...c.fallbackFrames]),...(manifest.emotions||[]).map(e=>e.file)];
 for(const frame of files){
  const resolved=await realpath(path.join(base,frame)).catch(()=>{throw Error(`缺少帧文件：${frame}`);});
  if(!resolved.startsWith(base+path.sep))throw Error('帧文件不能指向角色包外');
 }
 return {folder:base,manifest};
}
const persist=()=>writeFile(path.join(dataDir,'desktop.json'),JSON.stringify(settings,null,2),{mode:0o600});
function selected(){return characters.find(c=>c.manifest.id===settings.character)||characters[0];}
function getSystemIdleSeconds(){
 try{return typeof powerMonitor?.getSystemIdleTime==='function'?powerMonitor.getSystemIdleTime():null;}catch{return null;}
}
async function snapshot(){
 if(!hub||!selected())return bootSnapshot({...settings,chat:{...settings.chat,apiKey:settings.chat.apiKey?'***':''}},characters);
 const tools={};
 const enabledSet=new Set(Array.isArray(settings.enabledAgents)?settings.enabledAgents:[]);
 for(const [id,def] of Object.entries(AGENT_DEFINITIONS)){
  const detected=detectInstalledPaths(def,homedir());
  if(managers[id]){
   const st=await managers[id].status();
   tools[id]={detected,...st,installed:st.installed||enabledSet.has(id),mode:def.mode};
  }else{
   tools[id]={ok:true,detected,installed:enabledSet.has(id),mode:def.mode};
  }
 }
 const c=selected();
 const hs=hub.store.snapshot();
 const activityStats=activityStore?activityStore.todaySnapshot({systemIdleSeconds:getSystemIdleSeconds()}):null;
 const userActivity=activityStats?.activity?.state||'idle';
 if(activityStats&&activityStats.totals.keystrokes>hs.typing.today){
  hs.typing={...hs.typing,today:activityStats.totals.keystrokes,connected:hs.typing.connected||settings.typingEnabled};
 }else if(settings.typingEnabled&&stopTyping){
  hs.typing={...hs.typing,connected:true};
 }
 // R-2 Dual-Signal Fusion:
 // Priority 1: AI events (waiting, error, done) ALWAYS take priority even in companion mode or when user is away.
 const highPriorityAi=['waiting','error','done'].includes(hs.aggregate.state);
 const hasActiveAgentSession=hs.sessions.some(s=>['antigravity','codex','claude-code','cursor','deepseek','doubao-pro','workbuddy','grokbot','muse','generic'].includes(s.source)&&s.state==='working');
 if(settings.mode==='companion'){
  if(!highPriorityAi){
   const typingWorking=settings.typingEnabled&&userActivity!=='away'&&(userActivity==='active'||(hub.store.typing.lastActive!==null&&Date.now()-hub.store.typing.lastActive<10000));
   hs.aggregate={...hs.aggregate,state:typingWorking?'working':'idle'};
  }
  hs.sessions=[];
 }else if(!highPriorityAi&&!hasActiveAgentSession){
  const typingWorking=settings.typingEnabled&&userActivity!=='away'&&(userActivity==='active'||(hub.store.typing.lastActive!==null&&Date.now()-hub.store.typing.lastActive<10000));
  if(typingWorking)hs.aggregate={...hs.aggregate,state:'working'};
 }
 if(chat?.snapshot().busy)hs.aggregate={state:'waiting',quiet:false};
 else if(Date.now()<chatDoneUntil)hs.aggregate={state:'done',quiet:false};
 return {
  agentWorking:settings.mode==='agent'&&hs.aggregate.state==='working'&&hasActiveAgentSession,
  integrationCommand:JSON.stringify(nodeRuntime)+' '+JSON.stringify(path.join(dataDir,'integrations/packages/cli/petlink.mjs')),
  ...hs,
  activity:activityStats?.activity||{state:userActivity,idleSeconds:Math.max(0,(Date.now()-lastKeyboardActivity)/1000),awayThresholdSeconds:300},
  activityStats,
  companion:companion?.snapshot(),
  controlPage,
  controlPageRequest,
  settings:{...settings,chat:{...settings.chat,apiKey:settings.chat.apiKey?'***':''}},
  chat:chat?.snapshot(),
  tools,
  characters:characters.map(c=>({id:c.manifest.id,name:c.manifest.name})),
  character:{manifest:c.manifest,base:pathToFileURL(c.folder+path.sep).href},
  log:redact(hub.store.log,[settings.chat.apiKey]),
  port:hub.port,
  token:hub.token.slice(0,4)+'…'+hub.token.slice(-4)
 };
}
function play(arg){const m=selected()?.manifest;if(!m)throw Error('角色未加载');if(arg?.type==='clip'&&!m.clips?.[arg.id])return;if(arg?.type==='state'&&!m.states?.[arg.id]?.[arg.index||0])throw Error('动作不存在');if(arg?.type==='emotion'&&!m.emotions?.[arg.index])throw Error('表情不存在');if(!['clip','state','emotion'].includes(arg?.type))throw Error('播放类型无效');if(pet&&!pet.isDestroyed())pet.webContents.send('play-clip',arg);}
async function broadcast(){const s=await snapshot();for(const w of [pet,control,chatWindow])if(w&&!w.isDestroyed())w.webContents.send('snapshot',s);}
let bootComplete=false,bootProgress=[];
const bootReport=()=>bootProgress.filter(s=>s.status==='failed');
function showControl(page){if(typeof page==='string'){controlPage=page;controlPageRequest++;}companion?.companionship().then(broadcast).catch(e=>bootLog(e.stack));if(!control||control.isDestroyed()){control=new BrowserWindow({icon:appIcon,width:1040,height:780,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});secure(control);control.webContents.on('did-finish-load',()=>{if(!bootComplete)control.webContents.send('boot-progress',bootProgress);else control.webContents.send('boot-report',bootReport());});control.loadFile(path.join(here,bootComplete?'control.html':'boot.html')).catch(e=>bootLog(e.stack));}control.show();control.focus();}
function showChat(){if(!chatWindow||chatWindow.isDestroyed()){chatWindow=new BrowserWindow({icon:appIcon,width:360,height:480,frame:false,resizable:false,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});secure(chatWindow);chatWindow.loadFile(path.join(here,'chat.html'));}chatWindow.show();}
let stopTyping=null,stopActivityHook=null,lastKeyboardActivity=Date.now();
function notifyKeystrokePulse(){
 const now=Date.now();
 lastKeyboardActivity=now;
 if(hub){
  const wasInactive=hub.store.typing.lastActive===null||now-hub.store.typing.lastActive>1000;
  hub.store.typing.lastActive=now;
  hub.store.typing.lastSeen=now;
  if(wasInactive)broadcast().catch(e=>bootLog(e.message));
 }
 if(pet&&!pet.isDestroyed()){
  pet.webContents.send('activity-state',{
   keyboardIdleSeconds:0,
   userActivity:'active',
   keystrokePulse:true
  });
 }
}
function startTyping(){
 if(stopTyping)return;
 try{
  const {uIOhook}=createRequire(import.meta.url)('uiohook-napi');
  if(activityStore){
   stopActivityHook=startActivityCollector({
    hook:uIOhook,
    store:activityStore,
    onKeystroke:()=>{
     notifyKeystrokePulse();
     hub?.store.accept({v:1,source:'typing',session:'desktop-integrated',state:'working',count:1,ts:Date.now()});
    },
    onActivity:()=>{lastKeyboardActivity=Date.now();}
   });
   stopTyping=()=>stopActivityHook?.();
  }else{
   stopTyping=startEmbeddedTyping({
    hook:uIOhook,
    onActivity:notifyKeystrokePulse,
    onCount:count=>hub.store.accept({v:1,source:'typing',session:'desktop-integrated',state:count?'working':'idle',count,ts:Date.now()})
   });
  }
  bootLog('[typing] integrated activity collector started');
 }catch(e){
  bootLog('[typing] unavailable: '+e.message);
 }
}
function disableTyping(){stopTyping?.();stopTyping=null;stopActivityHook=null;if(hub)hub.store.typing.lastSeen=null;}
function secure(w){w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
function updateTrayMenu(){
 if(!tray)return;
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:'打开控制页',click:()=>showControl()},
  {label:'键盘热力图',click:()=>showControl('heatmap')},
  {label:'今日陪伴日报',click:()=>showControl('report')},
  {label:'桌宠鼠标穿透（防遮挡）',type:'checkbox',checked:!!settings.clickThrough,click:async item=>{settings.clickThrough=item.checked;resize();updateTrayMenu();await persist();await broadcast();}},
  {label:'显示 / 隐藏桌宠',enabled:!!pet&&!pet.isDestroyed(),click:()=>{if(pet&&!pet.isDestroyed())pet.isVisible()?pet.hide():pet.show();}},
  {label:'退出',click:()=>app.quit()}
 ]));
}
let petMouseIgnored=false;
function resize(){
 if(!pet||pet.isDestroyed())return;
 const width=Math.round(300*settings.scale),height=Math.round(350*settings.scale);
 const [oldWidth,oldHeight]=pet.getSize();
 if(width!==oldWidth||height!==oldHeight){
  const unlock=process.platform==='win32'&&!pet.isResizable();
  if(unlock)pet.setResizable(true);
  try{pet.setSize(width,height);}finally{if(unlock)pet.setResizable(false);}
 }
 pet.setOpacity(settings.opacity);
 pet.setAlwaysOnTop(settings.alwaysOnTop,'floating');
 petMouseIgnored=!!settings.clickThrough;
 pet.setIgnoreMouseEvents(petMouseIgnored,{forward:true});
}
function applyPetPosition(nx,ny){
 if(!pet||pet.isDestroyed())return;
 const unlock=process.platform==='win32'&&!pet.isResizable();
 if(unlock)pet.setResizable(true);
 try{pet.setPosition(Math.round(nx),Math.round(ny));}finally{if(unlock)pet.setResizable(false);}
}
function resetNotifier(){notifier?.close();notifier=createNotifier({hub,quietHours:settings.quietHours,onNotify:event=>{if(settings.notifications.includes(event.state)&&Notification.isSupported()){const n=new Notification({title:'PetLink',body:{waiting:'等你确认',done:'任务完成啦',error:'好像出错了'}[event.state],silent:true});n.on('click',()=>{showControl();});n.show();}},onSound:event=>{if(event.state==='waiting'&&settings.sound)shell.beep();},webhookUrl:settings.webhookEnabled?settings.webhookUrl:undefined,webhookHeaders:settings.webhookHeaders,logger:message=>hub.store.record({notification:message})});}
if(!app.requestSingleInstanceLock()){
 bootLog('[boot] single-instance lock failed: another instance may be running');
 try{dialog.showErrorBox('PetLink','PetLink 可能已在运行（或旧进程未退出），请先结束已有 PetLink 进程后重试');}finally{app.quit();}
}else{
app.on('second-instance',()=>{if(app.isReady())showControl();});
app.on('window-all-closed',()=>{});
app.whenReady().then(()=>{
showControl();
bootLog('[boot] control window created');
const stage=createStageRunner(progress=>{bootProgress=progress;if(control&&!control.isDestroyed())control.webContents.send('boot-progress',progress);},bootLog);
async function boot(){
 const data=await stage('data','准备数据目录',async()=>{
  await mkdir(dataDir,{recursive:true});
  for(const name of ['adapters','protocol','shared','cli'])await cp(path.join(root,'packages',name),path.join(dataDir,'integrations/packages',name),{recursive:true,filter:source=>!source.endsWith('.test.mjs')});
  const execDir=path.dirname(process.execPath);
  activityStore=createActivityStore({
   dataDir,
   mirrorPaths:[path.join(execDir,'activity.sqlite'),path.join(execDir,'data','activity.sqlite')],
   awayThresholdSeconds:300
  });
 });
 await stage('data','读取设置',async()=>{try{settings={...settings,...JSON.parse(await readFile(path.join(dataDir,'desktop.json'),'utf8'))};}catch(e){if(e.code!=='ENOENT')throw Error('读取本机设置失败，请检查 desktop.json 格式');}logSecrets=[settings.chat?.apiKey].filter(v=>typeof v==='string');settings.chat=validateChat({...{url:'',apiKey:'',model:'',prompt:DEFAULT_PROMPT},...settings.chat});logSecrets=[settings.chat.apiKey];});
 const builtIn=await stage('characters','加载内置角色',async()=>{
  const {readdir}=await import('node:fs/promises');
  const builtinRoot=path.join(root,'characters');
  const entries=(await readdir(builtinRoot)).sort((a,b)=>{
   const order=['xiaodada','dafeiyu'];
   const ia=order.indexOf(a),ib=order.indexOf(b);
   if(ia!==-1||ib!==-1)return (ia===-1?999:ia)-(ib===-1?999:ib);
   return a.localeCompare(b);
  });
  for(const name of entries){
   const dir=path.join(builtinRoot,name);
   if(!existsSync(path.join(dir,'manifest.json')))continue;
   try{characters.push(await loadCharacter(dir));}catch(e){bootLog(`[characters] skip ${name}: ${e.message}`);}
  }
  if(!characters.length)throw Error('未找到任何有效内置角色');
 },{timeout:true});
 await stage('characters','扫描用户角色',async()=>{
  const {readdir}=await import('node:fs/promises');let names;
  try{names=await readdir(path.join(dataDir,'characters'));}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const name of names)await stage('characters',`加载用户角色 ${name}`,async()=>{characters.push(await loadCharacter(path.join(dataDir,'characters',name)));},{timeout:true});
 });
 let serviceTimedOut=false;
 const service=await stage('hub','启动服务',async()=>{const pending=startHub({dataDir});pending.then(value=>{if(serviceTimedOut)value.close().catch(e=>bootLog(e.stack));},()=>{});return pending;},{timeout:true});
 serviceTimedOut=!service.ok;
 if(service.ok){
  hub=service.value;
  chat=await createChat({dataDir,config:()=>settings.chat,onChange:async done=>{if(done)chatDoneUntil=Date.now()+2000;await broadcast();}});
  if(settings.typingEnabled)startTyping();
  await stage('companion','初始化陪伴',async()=>{
   companion=await createCompanion({dataDir,playClip:id=>play({type:'clip',id})});
   await companion.companionship();
   hub.store.events.on('acceptedEvent',(event,{synthetic=false}={})=>{
    if(event.state==='done'){
     activityStore?.recordAiDone(1);
     if(!synthetic)companion.reward(event).then(broadcast).catch(e=>bootLog(e.stack));
     else broadcast().catch(e=>bootLog(e.stack));
    }
   });
  });
 }

 if(service.ok){
  const stop=startLocalSessions({accept:event=>hub.store.accept(event),onError:e=>bootLog('local-session-reader '+e.message)});
  autoDetector=startAutoDetector({
   accept:event=>hub.store.accept(event),
   isEnabled:id=>Array.isArray(settings.enabledAgents)&&settings.enabledAgents.includes(id),
   onError:e=>bootLog('auto-detector '+e.message)
  });
  app.once('before-quit',()=>{stop();autoDetector?.stop();});
 }
 if(service.ok)await stage('hub','初始化通知',()=>resetNotifier());
 await stage('pet','打开桌宠',async()=>{
  if(!canCreatePet(builtIn,service,data))throw Error('桌宠未启动：'+[!builtIn.ok&&'内置角色加载失败',!service.ok&&'服务启动失败',!data.ok&&'数据目录准备失败'].filter(Boolean).join('、'));
  pet=new BrowserWindow({icon:appIcon,width:300,height:350,frame:false,transparent:true,resizable:false,alwaysOnTop:true,skipTaskbar:true,hasShadow:false,webPreferences:{backgroundThrottling:false,preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});secure(pet);resize();
  bootLog('stage=pet-drag-channel ok');
  if(settings.position){const p=settings.position;const area=screen.getDisplayNearestPoint(p).workArea;applyPetPosition(Math.max(area.x,Math.min(p.x,area.x+area.width-pet.getBounds().width)),Math.max(area.y,Math.min(p.y,area.y+area.height-pet.getBounds().height)));}
  dragLog('startup '+JSON.stringify({displays:screen.getAllDisplays().map(d=>({id:d.id,scaleFactor:d.scaleFactor,bounds:d.bounds})),initialBounds:pet.getBounds()}));
  pet.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});await pet.loadFile(path.join(here,'pet.html'));
  pet.on('moved',()=>{const [x,y]=pet.getPosition();settings.position={x,y};persist().catch(()=>{});});
 });
 await stage('pet','创建托盘',async()=>{
  const icon=nativeImage.createFromPath(path.join(root,'assets','app-icon.png'));tray=new Tray(icon.resize({width:18,height:18}));tray.setToolTip('PetLink');updateTrayMenu();
 });
 bootComplete=true;await finishBoot({loadFile:file=>control.loadFile(path.join(here,file)),webContents:control.webContents},bootReport());if(!settings.onboarded||bootReport().length)showControl();
}
let petDragStart=null;
ipcMain.on('pet-drag-end',()=>{petDragStart=null;});
ipcMain.on('pet-mouse-ignore',(event,ignore)=>{
 if(event.sender!==pet?.webContents||!pet||pet.isDestroyed())return;
 const next=settings.clickThrough?true:!!ignore;
 if(next!==petMouseIgnored){petMouseIgnored=next;pet.setIgnoreMouseEvents(next,{forward:true});}
});
ipcMain.on('pet-drag-log',(event,sample)=>{
 if(event.sender!==pet?.webContents||!sample||!['pointerdown','pointermove','pointerup','pointercancel','dragstart','contextmenu','dblclick'].includes(sample.event))return;
 const target=['img','bubble','main'].includes(sample.target)?sample.target:'main';
 dragLog('renderer '+JSON.stringify({event:sample.event,target,screenX:Number(sample.screenX),screenY:Number(sample.screenY),count:Number(sample.count)||undefined}));
});
ipcMain.handle('desktop',async(event,command,arg)=>{
 if(![pet,control,chatWindow].some(w=>w&&!w.isDestroyed()&&w.webContents===event.sender))throw Error('来源无效');
 try{
 if(command==='chat-open'){dragLog('main command=chat-open');showChat();return {ok:true};}
 if(command==='chat-close'){chatWindow?.close();return;}
 if(command==='chat-settings'){showControl('pets');return;}
 if(command==='chat-send')return await chat.send(arg);
 if(command==='snapshot')return await snapshot();
 if(command==='menu'){
  dragLog('main command=menu');
  return await new Promise(resolve=>Menu.buildFromTemplate([
   {label:'控制页',click:()=>showControl()},
   {label:'键盘热力图',click:()=>showControl('heatmap')},
   {label:'今日陪伴日报',click:()=>showControl('report')},
   {label:'动作展示',click:()=>showControl('actions')},
   {label:'投喂',submenu:feedingMenu(companion?.snapshot(),{feed:id=>companion.feed(id,randomUUID()).then(broadcast).catch(e=>dialog.showErrorBox('投喂',e.message)),shop:()=>showControl('companion')})},
   ...[.5,1,1.5,2].map(scale=>({label:`大小 ${scale*100}%`,click:async()=>{settings.scale=scale;resize();await persist();await broadcast();}})),
   {label:'保持置顶',type:'checkbox',checked:settings.alwaysOnTop,click:async item=>{settings.alwaysOnTop=item.checked;resize();await persist();}},
   {label:'桌宠鼠标穿透（可从托盘关闭）',type:'checkbox',checked:!!settings.clickThrough,click:async item=>{settings.clickThrough=item.checked;resize();updateTrayMenu();await persist();await broadcast();}},
   {label:'退出',click:()=>app.quit()}
  ]).popup({window:pet,callback:resolve}));
 }
 if(command==='move'){
  if(!pet||pet.isDestroyed()||event.sender!==pet.webContents)return;
  if(!Number.isFinite(arg?.x)||!Number.isFinite(arg?.y))return;
  const position=pet.getPosition();
  if(arg.mode==='absolute'&&arg.start)petDragStart=position;
  const [x,y]=arg.mode==='absolute'?(petDragStart||position):position;
  applyPetPosition(x+arg.x,y+arg.y);
  if(++dragMoves%20===0)dragLog('main command=move '+JSON.stringify({count:dragMoves,mode:arg.mode||'relative',position:pet.getPosition()}));
  return;
 }
 if(!control||control.isDestroyed()||event.sender!==control.webContents)throw Error('请在控制页操作');
 if(command==='chat-clear'){await chat.clear();return {ok:true};}
 if(command==='typing-folder'){await shell.openPath(path.dirname(process.execPath));return {ok:true};}
 if(command==='buy'||command==='feed'){const result=await companion[command](arg.id,arg.requestId);await broadcast();return result;}
 if(command==='claim-milestone'){const result=await companion.claimMilestone(arg.id,arg.points);await broadcast();return result;}
 if(command==='play'){play(arg);return {ok:true};}
 if(command==='copy-token'){if(hub?.token)clipboard.writeText(hub.token);return {ok:true};}
 if(command==='open-extension'){await shell.openPath(path.join(root,'extensions/petlink-web-bridge'));return {ok:true};}
 if(command==='adapter'){
  if(!AGENT_DEFINITIONS[arg?.source]||!['enable','disable'].includes(arg?.action))throw Error('工具操作无效');
  const set=new Set(Array.isArray(settings.enabledAgents)?settings.enabledAgents:[]);
  let result={ok:true};
  if(managers[arg.source]){
   result=await managers[arg.source][arg.action]();
  }
  if(arg.action==='enable'){
   set.add(arg.source);
   autoDetector?.registerEnabledSession(arg.source);
  }else{
   set.delete(arg.source);
   hub?.store.accept({v:1,source:arg.source,session:`auto-${arg.source}`,state:'offline',ts:Date.now()});
  }
  settings.enabledAgents=[...set];
  await persist();
  await broadcast();
  return result;
 }
 if(command==='activity-record'){
  if(!activityStore)throw Error('活动统计模块未初始化');
  if(arg?.keys||arg?.keystrokes||arg?.clicks||arg?.wheelSteps){
   activityStore.recordBatch(arg);
   if(Number(arg.keystrokes)>0){
    notifyKeystrokePulse();
    hub?.store.accept({v:1,source:'typing',session:'desktop-integrated',state:'working',count:Number(arg.keystrokes),ts:Date.now()});
   }
  }
  if(Number.isFinite(arg?.aiWorkingSeconds)&&arg.aiWorkingSeconds>0)activityStore.recordAiWorkSeconds(arg.aiWorkingSeconds);
  if(Number.isFinite(arg?.aiDoneCount)&&arg.aiDoneCount>0)activityStore.recordAiDone(arg.aiDoneCount);
  if(arg?.simulatedIdleSeconds!==undefined)activityStore.setSimulatedIdleSeconds(arg.simulatedIdleSeconds);
  await broadcast();
  return {ok:true,activityStats:activityStore.todaySnapshot({systemIdleSeconds:getSystemIdleSeconds()})};
 }
 if(command==='save-report-card'){
  if(typeof arg?.dataUrl!=='string'||!arg.dataUrl.startsWith('data:image/png;base64,'))throw Error('日报图像数据格式无效');
  const buf=Buffer.from(arg.dataUrl.slice('data:image/png;base64,'.length),'base64');
  let targetPath=typeof arg.filePath==='string'&&arg.filePath?arg.filePath:null;
  if(!targetPath){
   const result=await dialog.showSaveDialog(control,{
    title:'保存今日陪伴日报长图',
    defaultPath:arg.defaultName||`PetLink-日报卡片-${new Date().toLocaleDateString('en-CA')}.png`,
    filters:[{name:'PNG 图片',extensions:['png']}]
   });
   if(result.canceled||!result.filePath)return {ok:true,canceled:true};
   targetPath=result.filePath;
  }
  await mkdir(path.dirname(targetPath),{recursive:true});
  await writeFile(targetPath,buf);
  return {ok:true,filePath:targetPath,bytes:buf.length};
 }
 if(command==='settings'){
  const allowed=['mode','theme','clickThrough','typingFloatEnabled','heatmapLayout','heatmapPalette','heatmapCustomLow','heatmapCustomHigh','chat','lookAtMouse','typingAutostart','typingEnabled','scale','opacity','sound','quietHours','notifications','webhookEnabled','webhookUrl','webhookHeaders','onboarded','character'];
  if(!arg||Object.keys(arg).some(k=>!allowed.includes(k)))throw Error('设置字段无效');
  const next={...settings,...arg};
  if(!['companion','agent'].includes(next.mode))throw Error('模式无效');
  if(!THEME_IDS.includes(next.theme))throw Error('皮肤主题无效');
  if(!KEYBOARD_LAYOUTS[next.heatmapLayout])throw Error('键盘配列无效');
  if(next.heatmapPalette!=='custom'&&!HEATMAP_PALETTES[next.heatmapPalette])throw Error('热力图配色无效');
  if(arg.chat){next.chat=validateChat({...settings.chat,...arg.chat});if(arg.chat.apiKey==='***')next.chat.apiKey=settings.chat.apiKey;}
  for(const k of ['lookAtMouse','typingAutostart','typingEnabled','clickThrough','typingFloatEnabled'])if(typeof next[k]!=='boolean')throw Error('开关无效');
  if(!characters.some(c=>c.manifest.id===next.character))throw Error('角色不存在');
  if(!Number.isFinite(next.scale)||next.scale<.5||next.scale>2||!Number.isFinite(next.opacity)||next.opacity<.2||next.opacity>1)throw Error('大小或不透明度超出范围');
  isQuietHour(Date.now(),next.quietHours);if(!Array.isArray(next.notifications)||next.notifications.some(s=>!['waiting','done','error'].includes(s)))throw Error('通知状态无效');
  if(next.webhookEnabled&&!/^https?:$/.test(new URL(next.webhookUrl).protocol))throw Error('Webhook 需使用 HTTP 或 HTTPS');
  if(!next.webhookHeaders||Array.isArray(next.webhookHeaders)||typeof next.webhookHeaders!=='object'||Object.values(next.webhookHeaders).some(v=>typeof v!=='string'))throw Error('自定义头必须为字符串键值对象');
  const notificationChanged=['quietHours','notifications','sound','webhookEnabled','webhookUrl','webhookHeaders'].some(k=>JSON.stringify(next[k])!==JSON.stringify(settings[k]));
  const typingChanged=settings.typingEnabled!==next.typingEnabled;
  settings=next;logSecrets=[...logSecrets,settings.chat.apiKey];
  await persist();
  if(typingChanged){if(settings.typingEnabled)startTyping();else disableTyping();}
  resize();updateTrayMenu();
  if(notificationChanged)resetNotifier();
 }
 if(command==='test'){hub.store.accept({v:1,source:arg?.source||'generic',session:'desktop-test-'+Date.now(),state:arg?.state||'done',ts:Date.now(),title:'连接测试'},{synthetic:true});}
 if(command==='clear')hub.store.clearLog();
 if(command==='diagnostics')return diagnostics(hub,settings.chat.apiKey);
 if(command==='export'){const result=await dialog.showSaveDialog(control,{defaultPath:'petlink-diagnostics.json'});if(!result.canceled){await writeFile(result.filePath,JSON.stringify(diagnostics(hub,settings.chat.apiKey),null,2),{mode:0o600});}}
 if(command==='import'){const result=await dialog.showOpenDialog(control,{properties:['openDirectory']});if(!result.canceled){const c=await loadCharacter(result.filePaths[0]);if(!/^[a-z0-9_-]+$/.test(c.manifest.id))throw Error('角色 id 只能用小写字母、数字、下划线和连字符');if(characters.some(x=>x.manifest.id===c.manifest.id))throw Error('同名角色已存在');const dest=path.join(dataDir,'characters',c.manifest.id);await cp(c.folder,dest,{recursive:true,dereference:true});characters.push(await loadCharacter(dest));settings.character=c.manifest.id;await persist();}}
 await broadcast();return {ok:true};
 }catch(e){return {ok:false,message:e.message};}
});
setInterval(()=>{
 if(pet&&!pet.isDestroyed()){
  const act=activityStore?.activityState({systemIdleSeconds:getSystemIdleSeconds()});
  pet.webContents.send('activity-state',{
   keyboardIdleSeconds:act?act.idleSeconds:Math.max(0,(Date.now()-lastKeyboardActivity)/1000),
   userActivity:act?.state||'idle'
  });
 }
},250).unref();
setInterval(()=>{
 if(hub&&activityStore){
  const hasWorkingAi=[...hub.store.sessions.values()].some(s=>s.state==='working'||s.state==='waiting');
  if(hasWorkingAi)activityStore.recordAiWorkSeconds(1);
 }
 broadcast().catch(()=>{});
},1000).unref();
boot().catch(e=>bootLog(e.stack));
app.on('before-quit',event=>{if(closing)return;event.preventDefault();closing=true;disableTyping();activityStore?.close();notifier?.close();Promise.all([persist(),notifier?.flush(),companion?.flush()]).then(()=>hub?.close()).catch(e=>bootLog(e.stack)).finally(()=>app.quit());});
}).catch(error=>{bootLog(`[boot] ready failed\n${error.stack||error}`);try{dialog.showErrorBox('PetLink 启动错误',error.stack||String(error));}catch{}});
}
