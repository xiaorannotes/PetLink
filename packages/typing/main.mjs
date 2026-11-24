import {app,Tray,Menu,nativeImage} from 'electron';
import {uIOhook} from 'uiohook-napi';
import {discoverHub,defaultDataDir} from '../shared/index.mjs';
import {createCounter} from './counter.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Independent lock; no desktop startup, loggers, renderer or content persistence.
app.setPath('userData',path.join(app.getPath('appData'),'petlink-typing'));
if(!app.requestSingleInstanceLock())app.quit();else {
 const counter=createCounter();let tray,timer,inflight=false;
 app.whenReady().then(()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  tray=new Tray(nativeImage.createFromPath(path.join(root,'characters/xiaodada/frames/idle/idle/frame_000.webp')).resize({width:18,height:18}));
  tray.setToolTip('PetLink 打字跟随 · 只计数不记录');tray.setContextMenu(Menu.buildFromTemplate([{label:'只统计按键次数，不记录输入内容',enabled:false},{label:'退出打字跟随',click:()=>app.quit()}]));
  uIOhook.on('keydown',counter.increment);uIOhook.start();
  timer=setInterval(async()=>{if(inflight)return;inflight=true;const count=counter.take();try{const {port,token}=await discoverHub(defaultDataDir());await fetch(`http://127.0.0.1:${port}/v1/event`,{method:'POST',headers:{'content-type':'application/json','x-petlink-token':token},body:JSON.stringify({v:1,source:'typing',session:'typing-helper',state:count?'working':'idle',count,ts:Date.now()}),signal:AbortSignal.timeout(4000)});}catch{}finally{inflight=false;}},5000);
 }).catch(()=>app.quit());
 app.on('window-all-closed',()=>{});app.on('before-quit',()=>{clearInterval(timer);try{uIOhook.stop();}catch{}tray?.destroy();});
}
