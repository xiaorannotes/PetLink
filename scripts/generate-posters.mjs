import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const outDir=path.resolve(root,'../../outputs/posters');
const artifactDir='/Users/xiaoran/.gemini/antigravity/brain/d5c10236-9097-45ff-bf0f-ed537047a1dc';
const appBinary=path.join(root,'dist/m6-mac/PetLink-Mac/PetLink.app/Contents/MacOS/Electron');
const dafeiyuFrames=pathToFileURL(path.join(root,'characters/dafeiyu/frames/')).href;

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
  if(m.error)throw Error(JSON.stringify(m.error));
  return m.result;
 };
 return {
  send,
  close:()=>ws.close(),
  capture:async(file,clip)=>{
   const res=await send('Page.captureScreenshot',{format:'png',...(clip?{clip}:{captureBeyondViewport:false})});
   await writeFile(file,Buffer.from(res.data,'base64'));
  },
  eval:async expression=>{
   const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
   return r.result.value;
  }
 };
}

await mkdir(outDir,{recursive:true});
const base=await mkdtemp('/tmp/petlink-posters-');
const child=spawn(appBinary,[
 '--user-data-dir='+base+'/electron',
 '--inspect=9393',
 '--remote-debugging-port=9392',
 path.join(root,'dist/m6-mac/PetLink-Mac/PetLink.app/Contents/Resources/app')
],{
 env:{...process.env,PETLINK_DATA_DIR:base},
 stdio:'ignore',
 detached:true
});

const clients=[];
try{
 let ts;
 for(let i=0;i<60;i++){
  await sleep(250);
  try{
   ts=await targets(9392);
   if(ts.some(t=>t.url.endsWith('control.html')))break;
  }catch{}
 }
 const control=await connect(ts.find(t=>t.url.endsWith('control.html')));clients.push(control);
 const main=await connect((await targets(9393))[0]);clients.push(main);

 await sleep(600);
 await control.eval(`document.getElementById('skip')?.click()`);
 // Switch strictly to 大肥鱼 (dafeiyu) - never use 肖大大 in public promotional posters!
 await control.eval(`window.petlink.call('settings',{character:'dafeiyu',onboarded:true})`);
 await sleep(400);

 // Seed realistic multi-hour activity for rich charts & heatmap
 const hourlySeed=[
  [9,320,85,60],[10,540,120,90],[11,480,110,75],[13,260,65,45],
  [14,620,160,110],[15,710,185,130],[16,490,130,85],[17,260,85,45]
 ];
 const keySeed={
  E:420,SPACE:390,A:280,S:240,D:230,F:195,J:180,K:175,L:160,ENTER:310,
  BACKSPACE:190,T:210,I:220,O:185,N:205,R:215,C:170,V:150,LSHIFT:165,
  LCTRL:140,LMETA:155,TAB:130,W:145,Q:95,P:110,M:125,B:90,G:105,H:115,
  U:135,Y:100,Z:75,X:85,COMMA:95,PERIOD:105,SLASH:80,1:65,2:70,3:60,ESC:85
 };
 for(const [hour,k,c,w] of hourlySeed){
  await control.eval(`window.petlink.call('activity-record',${JSON.stringify({hour,keystrokes:k,clicks:c,wheelSteps:w})})`);
 }
 await control.eval(`window.petlink.call('activity-record',${JSON.stringify({
  keystrokes:0,clicks:0,wheelSteps:0,keys:keySeed,aiWorkingSeconds:8520,aiDoneCount:12
 })})`);
 await sleep(400);

 // Capture real dafeiyu UI screenshots as base64 data URLs to embed into posters
 await control.eval(`document.querySelector('[data-page="connections"]').click()`);
 await sleep(300);
 const uiHomeB64=(await control.send('Page.captureScreenshot',{format:'png'})).data;

 await control.eval(`document.querySelector('[data-page="heatmap"]').click()`);
 await sleep(300);
 const uiHeatmapB64=(await control.send('Page.captureScreenshot',{format:'png'})).data;

 await control.eval(`document.querySelector('[data-page="report"]').click()`);
 await sleep(350);
 const reportCardDataUrl=await control.eval(`document.getElementById('report-canvas').toDataURL('image/png')`);

 await control.eval(`document.querySelector('[data-page="actions"]').click()`);
 await sleep(300);
 const uiActionsB64=(await control.send('Page.captureScreenshot',{format:'png'})).data;

 // Create an offscreen 1600x1000 poster rendering window in Electron
 await main.eval(`(async()=>{
  const el=process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(root,'package.json'))})('electron');
  globalThis.posterWin=new el.BrowserWindow({
   width:1600,height:1000,show:false,frame:false,
   webPreferences:{offscreen:false,contextIsolation:false,nodeIntegration:false,webSecurity:false}
  });
  await globalThis.posterWin.loadURL('about:blank');
 })()`);
 await sleep(300);
 const allTargets=await targets(9392);
 const posterTarget=allTargets.find(t=>t.url==='about:blank');
 const poster=await connect(posterTarget);clients.push(poster);
 await poster.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:2,mobile:false});

 const commonCss=`
  *{box-sizing:border-box;margin:0;padding:0}
  body{
   width:1600px;height:1000px;overflow:hidden;
   font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Microsoft YaHei",sans-serif;
   color:#4A3A2C;
   background:#FBF6EC;
   position:relative;
  }
  .bg-orb{position:absolute;border-radius:50%;filter:blur(65px);pointer-events:none;z-index:0}
  .wrap{position:relative;z-index:2;width:100%;height:100%;padding:56px 68px;display:flex;flex-direction:column;justify-content:space-between}
  .top-bar{display:flex;align-items:center;justify-content:space-between}
  .brand-pill{display:inline-flex;align-items:center;gap:12px;background:#FFFDF8;border:1.5px solid #F0E4CE;padding:10px 22px;border-radius:999px;box-shadow:0 8px 24px rgba(180,140,80,.08)}
  .brand-pill b{font-size:22px;color:#4A3A2C;letter-spacing:.5px}
  .brand-pill span{font-size:14px;color:#9A8874;border-left:1.5px solid #EADBC2;padding-left:12px}
  .tag-badge{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#F6A8B8,#E87A92);color:#FFF;padding:10px 22px;border-radius:999px;font-weight:700;font-size:15px;box-shadow:0 8px 20px rgba(232,122,146,.25)}
  .card{background:#FFFDF8;border:1.5px solid #F0E4CE;border-radius:28px;box-shadow:0 16px 40px rgba(160,120,70,.10)}
  .ui-shot{border-radius:22px;border:2px solid #F0E4CE;box-shadow:0 22px 50px rgba(110,80,45,.16);background:#FFFDF8}
  .footer-bar{display:flex;align-items:center;justify-content:space-between;padding-top:16px;border-top:1.5px dashed #E6D7BE;font-size:15px;color:#8C7A66}
  .footer-pills{display:flex;gap:12px}
  .footer-pill{background:#FFFDF8;border:1px solid #EADBC2;padding:6px 16px;border-radius:999px;font-size:13.5px;color:#6E5A48;font-weight:600}
 `;

 const posters=[
  {
   file:'海报01-主视觉总览.png',
   html:`<!doctype html><html><head><meta charset="utf-8"><style>${commonCss}
    .hero-grid{display:grid;grid-template-columns:610px 1fr;gap:44px;align-items:center;flex:1;margin:20px 0}
    .hero-title{font-size:56px;line-height:1.18;font-weight:800;color:#3E2E20;margin:18px 0 16px}
    .hero-title em{font-style:normal;color:#E26B85;background:linear-gradient(180deg,transparent 65%,#FCE1E7 65%);padding:0 4px}
    .hero-sub{font-size:21px;line-height:1.65;color:#786552;margin-bottom:28px}
    .feature-list{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .feat-item{padding:18px 20px;border-radius:22px;background:#FFFDF8;border:1.5px solid #F0E4CE;box-shadow:0 8px 20px rgba(160,120,70,.07)}
    .feat-item b{display:block;font-size:18px;color:#4A3A2C;margin-bottom:4px}
    .feat-item span{font-size:13.5px;color:#8C7A66;line-height:1.45;display:block}
    .showcase{position:relative;height:720px;display:flex;align-items:center;justify-content:center}
    .main-shot{width:720px;transform:perspective(1200px) rotateY(-6deg) rotateX(2deg);position:absolute;left:10px;top:36px;z-index:2}
    .pet-float-card{position:absolute;right:0;bottom:18px;width:300px;padding:20px;z-index:4;background:rgba(255,253,248,.96);backdrop-filter:blur(10px);text-align:center}
    .pet-float-card img{width:230px;height:155px;object-fit:contain;margin-top:6px}
    .pet-bubble{background:#FFF6F8;border:1.5px solid #F6A8B8;color:#D95B78;padding:8px 16px;border-radius:16px;font-weight:700;font-size:15px;display:inline-block;margin-bottom:4px}
    .mini-pose{position:absolute;left:-18px;bottom:14px;width:285px;padding:14px 18px;z-index:4;display:flex;align-items:center;gap:14px}
    .mini-pose img{width:96px;height:86px;object-fit:contain;flex-shrink:0}
   </style></head><body>
    <div class="bg-orb" style="width:520px;height:520px;background:#FCE0E6;top:-120px;right:-80px"></div>
    <div class="bg-orb" style="width:460px;height:460px;background:#FCEBC8;bottom:-120px;left:260px"></div>
    <div class="wrap">
     <div class="top-bar">
      <div class="brand-pill"><b>🐾 PetLink</b><span>Open Source AI Desktop Companion</span></div>
      <div class="tag-badge">★ GitHub 开源版 · 原创 IP「大肥鱼」106 段动作</div>
     </div>
     <div class="hero-grid">
      <div>
       <div style="display:inline-block;background:#FCEBC8;color:#8A6420;padding:6px 16px;border-radius:999px;font-weight:700;font-size:14px">双信号桌面伙伴 · AI 状态 + 键盘律动</div>
       <h1 class="hero-title">你的 AI 在干活，<br><em>大肥鱼</em>第一时间替它告诉你。</h1>
       <p class="hero-sub">专为 Claude Code、Codex、Cursor 开发者打造的桌面状态伴侣。长任务安心离开，平常打字也有灵动陪伴与可视化日报。</p>
       <div class="feature-list">
        <div class="feat-item"><b>🤖 AI 状态实时感知</b><span>运行中 / 等你确认 / 完成 / 报错，1 秒内联动桌宠动作与通知</span></div>
        <div class="feat-item"><b>⌨️ 键盘律动与浮字</b><span>随敲击节奏弹出「灵感 +1 ✨」，仅响应键盘，支持窗口鼠标穿透</span></div>
        <div class="feat-item"><b>🔥 三配列键盘热力图</b><span>支持 104 / 87 / 75% 配列切换与自定义配色，点亮指尖热区</span></div>
        <div class="feat-item"><b>📊 一键陪伴日报长图</b><span>汇总每日击键、趣味换算、24h 节奏曲线与 AI 协同工作时长</span></div>
       </div>
      </div>
      <div class="showcase">
       <img class="ui-shot main-shot" src="data:image/png;base64,${uiHomeB64}">
       <div class="card mini-pose">
        <img src="${dafeiyuFrames}bonus-003.png">
        <div><b style="font-size:15px;display:block">106 段透明动画</b><span style="font-size:12.5px;color:#8C7A66">VP9 Alpha 原生透明底</span></div>
       </div>
       <div class="card pet-float-card">
        <div class="pet-bubble">大肥鱼也在努力敲代码！</div><br>
        <span style="display:inline-block;background:#EFFAF5;color:#398E71;border:1px solid #79CBB0;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700">灵感 +1 ✨</span>
        <img src="${dafeiyuFrames}action-working.png">
       </div>
      </div>
     </div>
     <div class="footer-bar">
      <span>PetLink · Clean-Room Open Source Architecture (Electron + Node SQLite)</span>
      <div class="footer-pills">
       <span class="footer-pill">macOS & Windows 双平台</span>
       <span class="footer-pill">100% 本地存储 · 零联网遥测</span>
       <span class="footer-pill">内置 3 套主题皮肤</span>
      </div>
     </div>
    </div>
   </body></html>`
  },
  {
   file:'海报02-AI编程状态实时感知.png',
   html:`<!doctype html><html><head><meta charset="utf-8"><style>${commonCss}
    .header-block{text-align:center;margin:10px 0 18px}
    .header-block h1{font-size:46px;font-weight:800;color:#3E2E20}
    .header-block p{font-size:19px;color:#786552;margin-top:8px}
    .arch-banner{display:grid;grid-template-columns:1fr 60px 1fr 60px 1fr;align-items:center;padding:20px 30px;margin-bottom:22px;background:linear-gradient(135deg,#FFFDF8,#FCEBC844)}
    .arch-step{text-align:center;padding:10px 16px}
    .arch-step b{font-size:19px;color:#4A3A2C;display:block;margin-bottom:4px}
    .arch-step span{font-size:13.5px;color:#8C7A66}
    .arch-arrow{text-align:center;font-size:28px;color:#E26B85;font-weight:800}
    .states-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;flex:1}
    .state-card{padding:20px 16px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;position:relative;overflow:hidden}
    .state-pill{padding:5px 14px;border-radius:999px;font-weight:700;font-size:13.5px;color:#FFF}
    .state-card img{width:210px;height:145px;object-fit:contain;margin:8px 0}
    .state-quote{background:#FBF6EC;border:1px solid #EADBC2;border-radius:16px;padding:10px 12px;font-size:13.5px;color:#5C4A3A;width:100%;font-weight:600}
    .state-desc{font-size:12.5px;color:#8C7A66;line-height:1.45;margin-top:6px}
   </style></head><body>
    <div class="bg-orb" style="width:500px;height:500px;background:#E2F2FC;top:-100px;left:-80px"></div>
    <div class="bg-orb" style="width:500px;height:500px;background:#FCE0E6;bottom:-100px;right:-60px"></div>
    <div class="wrap">
     <div class="top-bar">
      <div class="brand-pill"><b>🐾 PetLink</b><span>01 · AI 编程状态实时感知</span></div>
      <div class="tag-badge">Claude Code · Codex · Cursor · 通用 CLI</div>
     </div>
     <div class="header-block">
      <h1>发起长任务后安心走开，AI 进展一眼即知</h1>
      <p>零侵入官方 Hooks 适配器（先备份、可一键还原）· 多会话智能优先级聚合（Waiting &gt; Error &gt; Done &gt; Working &gt; Idle）</p>
     </div>
     <div class="card arch-banner">
      <div class="arch-step"><b>🔌 零依赖适配器层</b><span>Claude Code / Codex / Cursor Hooks &amp; CLI<br>快进快出 (&lt;200ms)，静默容错绝不阻塞宿主</span></div>
      <div class="arch-arrow">➔</div>
      <div class="arch-step"><b>🧠 本地状态中枢 Hub</b><span>127.0.0.1 本机鉴权 · 300ms 去抖 · 多会话聚合<br>90 秒安静降亮 · 10 分钟陈旧自动检测</span></div>
      <div class="arch-arrow">➔</div>
      <div class="arch-step"><b>🍑 桌宠表现与通知层</b><span>大肥鱼五态专属动画 + 系统通知<br>支持安静时段免打扰与外发 Webhook</span></div>
     </div>
     <div class="states-grid">
      <div class="card state-card">
       <span class="state-pill" style="background:#D9A64F">最高优 · 等你确认 (Waiting)</span>
       <img src="${dafeiyuFrames}action-waiting.png">
       <div>
        <div class="state-quote">「大肥鱼等你确认哟~」</div>
        <p class="state-desc">AI 请求权限或等待输入时立即原地踱步提醒 + 轻提示音</p>
       </div>
      </div>
      <div class="card state-card">
       <span class="state-pill" style="background:#D98888">高优 · 出错终止 (Error)</span>
       <img src="${dafeiyuFrames}action-error.png">
       <div>
        <div class="state-quote">「哎呀，好像遇到小波折了」</div>
        <p class="state-desc">任务报错中断时垂头叹气冒汗，第一时间提醒排查</p>
       </div>
      </div>
      <div class="card state-card">
       <span class="state-pill" style="background:#7FAE7A">完成庆祝 (Done)</span>
       <img src="${dafeiyuFrames}action-done.png">
       <div>
        <div class="state-quote">「耶！大肥鱼为你欢呼！」</div>
        <p class="state-desc">任务完成瞬时雀跃欢呼，并自动奖励陪伴积分 (+3 分)</p>
       </div>
      </div>
      <div class="card state-card">
       <span class="state-pill" style="background:#8EABC3">Agent 思考中 (Working)</span>
       <img src="${dafeiyuFrames}action-agent-working.png">
       <div>
        <div class="state-quote">「咕噜咕噜，全速推进中」</div>
        <p class="state-desc">AI 正在执行工具或生成代码时，大肥鱼同步思考冒泡陪跑</p>
       </div>
      </div>
      <div class="card state-card">
       <span class="state-pill" style="background:#B5AA9A">安静待机 / 小憩 (Idle/Sleep)</span>
       <img src="${dafeiyuFrames}action-sleep.png">
       <div>
        <div class="state-quote">「呼……睡一小会儿」</div>
        <p class="state-desc">无任务时呼吸待机；5 分钟不敲键盘自动进入甜美小憩</p>
       </div>
      </div>
     </div>
     <div class="footer-bar">
      <span>协议隐私约束：仅传递状态枚举与项目目录名，严禁携带代码正文、提示词或密钥</span>
      <div class="footer-pills"><span class="footer-pill">链路延迟 &lt; 1 秒</span><span class="footer-pill">支持多会话并发聚合</span></div>
     </div>
    </div>
   </body></html>`
  },
  {
   file:'海报03-双信号融合与打字互动.png',
   html:`<!doctype html><html><head><meta charset="utf-8"><style>${commonCss}
    .main-cols{display:grid;grid-template-columns:1.05fr 0.95fr;gap:36px;flex:1;margin:18px 0;align-items:stretch}
    .left-col{display:flex;flex-direction:column;justify-content:space-between}
    .title-lg{font-size:44px;font-weight:800;line-height:1.22;color:#3E2E20}
    .title-lg em{font-style:normal;color:#E26B85}
    .sub-lg{font-size:18px;color:#786552;line-height:1.6;margin:12px 0 20px}
    .prio-stack{display:flex;flex-direction:column;gap:14px}
    .prio-card{padding:18px 22px;display:flex;align-items:center;gap:18px}
    .prio-num{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;font-weight:800;font-size:20px;color:#FFF;flex-shrink:0}
    .prio-card b{font-size:19px;display:block;margin-bottom:3px}
    .prio-card span{font-size:14px;color:#786552}
    .right-stage{padding:28px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(160deg,#FFFDF8 0%,#FFF4F6 100%);position:relative}
    .stage-preview{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:center;margin:10px 0}
    .pet-box{background:#FBF6EC;border:1.5px solid #F0E4CE;border-radius:24px;padding:18px;text-align:center;position:relative}
    .pet-box img{width:240px;height:165px;object-fit:contain}
    .float-pill{display:inline-block;padding:4px 13px;border-radius:999px;background:#FFF6F8;color:#D95B78;border:1.5px solid #F6A8B8;font-weight:700;font-size:13px;margin:4px 3px;box-shadow:0 4px 12px rgba(217,91,120,.14)}
    .guard-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .guard-box{background:#FFFDF8;border:1.5px solid #EADBC2;border-radius:18px;padding:14px 16px}
    .guard-box b{font-size:15.5px;display:block;margin-bottom:4px;color:#4A3A2C}
    .guard-box span{font-size:13px;color:#8C7A66;line-height:1.45;display:block}
   </style></head><body>
    <div class="bg-orb" style="width:480px;height:480px;background:#FCEBC8;top:-100px;right:200px"></div>
    <div class="wrap">
     <div class="top-bar">
      <div class="brand-pill"><b>🐾 PetLink</b><span>02 · 双信号驱动融合引擎</span></div>
      <div class="tag-badge">AI 状态信号 × 人的键盘活动信号</div>
     </div>
     <div class="main-cols">
      <div class="left-col">
       <div>
        <h1 class="title-lg">没开 AI 时也有生命力，<br>每一次敲击都有<em>同频回应</em>。</h1>
        <p class="sub-lg">在「AI 状态信号」之上叠加「人的键盘活动信号」通道。冲突规则严格写死：AI 完成、报错、等待事件永远拥有最高优先级；日常打字时桌宠陪你一起敲键盘。</p>
       </div>
       <div class="prio-stack">
        <div class="card prio-card" style="border-color:#F6A8B8;background:#FFF9FA">
         <div class="prio-num" style="background:linear-gradient(135deg,#F6A8B8,#E26B85)">P1</div>
         <div><b>第一优先级：AI 状态跃迁（Waiting / Error / Done）</b><span>即使你已离开电脑 5 分钟、桌宠正在熟睡，收到 AI 完成或等待确认事件时立即唤醒响应！</span></div>
        </div>
        <div class="card prio-card">
         <div class="prio-num" style="background:linear-gradient(135deg,#8EABC3,#5F87A8)">P2</div>
         <div><b>第二优先级：键盘活跃度三态（活跃打字 / 空闲 / 离开）</b><span>敲击键盘时同步「写代码」并弹出轻量浮字；滑动鼠标/触控板绝不误触发打字动作；5 分钟无按键进入小憩。</span></div>
        </div>
        <div class="card prio-card">
         <div class="prio-num" style="background:linear-gradient(135deg,#7FAE7A,#598C54)">P3</div>
         <div><b>第三优先级：陪伴经济与摸摸互动</b><span>左键摸摸触发 5 组性格回应轮换（挥手/跃动/咯咯笑/害羞/傲娇）；每日陪伴与完成任务获取积分投喂美食。</span></div>
        </div>
       </div>
      </div>
      <div class="card right-stage">
       <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:20px">✨ 实机互动特写 · 轻量不打扰</b>
        <span style="background:#EFFAF5;color:#2E8B67;padding:5px 14px;border-radius:999px;font-size:13px;font-weight:700">pointer-events: none 防遮挡</span>
       </div>
       <div class="stage-preview">
        <div class="pet-box">
         <div style="background:#FFFDF8;border:1px solid #F0E4CE;border-radius:14px;padding:7px 12px;font-size:13.5px;font-weight:700;margin-bottom:6px">「键盘响起来，思路跟着飞」</div>
         <div><span class="float-pill">灵感 +1 ✨</span><span class="float-pill">码力 +1 ⚡</span></div>
         <img src="${dafeiyuFrames}action-working.png">
         <small style="display:block;color:#8C7A66;font-size:12.5px;margin-top:4px">▲ 敲击键盘：写代码 + 轻量互动浮字</small>
        </div>
        <div class="pet-box">
         <div style="background:#FFFDF8;border:1px solid #F0E4CE;border-radius:14px;padding:7px 12px;font-size:13.5px;font-weight:700;margin-bottom:6px">「摸摸收到啦~」</div>
         <div><span class="float-pill">敲敲 ~ 🐾</span><span class="float-pill">专注 +1 💡</span></div>
         <img src="${dafeiyuFrames}pet-wave.png">
         <small style="display:block;color:#8C7A66;font-size:12.5px;margin-top:4px">▲ 点击摸摸：5 种性格动作轮换回应</small>
        </div>
       </div>
       <div class="guard-grid">
        <div class="guard-box"><b>🖱️ 窗口鼠标穿透开关</b><span>一键开启桌宠鼠标穿透（setIgnoreMouseEvents），点击与代码编辑直接穿透窗口，托盘可随时关闭。</span></div>
        <div class="guard-box"><b>🎯 触控板防误触隔离</b><span>鼠标点击与滚轮照常计入日报统计，但移动鼠标或滑动触控板不会触发桌宠敲键盘动画。</span></div>
       </div>
      </div>
     </div>
     <div class="footer-bar">
      <span>双平台实机拖拽修复：气泡与角色均支持丝滑拖拽定位并自动记忆屏幕坐标</span>
      <div class="footer-pills"><span class="footer-pill">浮字开关可配</span><span class="footer-pill">50%–200% 无级缩放</span></div>
     </div>
    </div>
   </body></html>`
  },
  {
   file:'海报04-键盘热力图与三配列定制.png',
   html:`<!doctype html><html><head><meta charset="utf-8"><style>${commonCss}
    .hm-layout{display:grid;grid-template-columns:1fr 450px;gap:36px;flex:1;margin:18px 0;align-items:center}
    .shot-frame{position:relative}
    .shot-frame img.ui-shot{width:100%;display:block}
    .side-panel{display:flex;flex-direction:column;gap:16px}
    .side-panel h1{font-size:40px;font-weight:800;line-height:1.22;color:#3E2E20}
    .side-panel h1 em{font-style:normal;color:#E26B85}
    .side-panel p{font-size:16.5px;color:#786552;line-height:1.6}
    .spec-card{padding:18px 20px}
    .spec-card b{font-size:17px;display:block;margin-bottom:8px;color:#4A3A2C}
    .pill-row{display:flex;flex-wrap:wrap;gap:8px}
    .chip{padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700;border:1px solid #EADBC2;background:#FBF6EC}
    .mascot-row{display:flex;align-items:center;gap:14px;padding:14px 18px}
    .mascot-row img{width:125px;height:95px;object-fit:contain}
   </style></head><body>
    <div class="bg-orb" style="width:520px;height:520px;background:#FDE8EE;top:-80px;left:350px"></div>
    <div class="wrap">
     <div class="top-bar">
      <div class="brand-pill"><b>🐾 PetLink</b><span>03 · 键盘热力图可视化</span></div>
      <div class="tag-badge">104 全尺寸 · 87 竞技 TKL · 75% 紧凑配列</div>
     </div>
     <div class="hm-layout">
      <div class="shot-frame">
       <img class="ui-shot" src="data:image/png;base64,${uiHeatmapB64}">
      </div>
      <div class="side-panel">
       <h1>看见指尖的温度，<br>支持<em>三种键盘配列</em>切换。</h1>
       <p>按当日各物理按键敲击频次实时 Gamma 平滑着色，自动统计高频按键 Top 5 与今日键鼠总量。</p>
       <div class="card spec-card">
        <b>⌨️ 三大主流机械键盘配列一键切换</b>
        <div class="pill-row">
         <span class="chip" style="background:#F6A8B8;color:#FFF;border-color:transparent">104 全尺寸 (104键)</span>
         <span class="chip">87 竞技配列 (87键)</span>
         <span class="chip">75% 紧凑配列 (84键)</span>
        </div>
       </div>
       <div class="card spec-card">
        <b>🎨 4 套内置热力配色 + 自定义低/高频取色器</b>
        <div class="pill-row">
         <span class="chip" style="background:linear-gradient(90deg,#FDE8EE,#E04F70);color:#FFF">蜜桃暖粉</span>
         <span class="chip" style="background:linear-gradient(90deg,#E2F6EE,#2B8F6C);color:#FFF">薄荷森林</span>
         <span class="chip" style="background:linear-gradient(90deg,#FDF1D6,#D97324);color:#FFF">琥珀暖阳</span>
         <span class="chip" style="background:linear-gradient(90deg,#E4EEFD,#3A6BD9);color:#FFF">晴空星海</span>
        </div>
       </div>
       <div class="card mascot-row">
        <img src="${dafeiyuFrames}bonus-002.png">
        <div>
         <b style="font-size:16px;display:block;margin-bottom:4px">🔒 仅记物理按键频次，绝不记顺序</b>
         <span style="font-size:13px;color:#8C7A66;line-height:1.45;display:block">SQLite WITHOUT ROWID 字典序聚合，不读取 Shift/输入法内容，无法还原任何输入文本。</span>
        </div>
       </div>
      </div>
     </div>
     <div class="footer-bar">
      <span>热力图实时响应每一次按键敲击 · 悬停键帽即可查看单键今日精确敲击次数</span>
      <div class="footer-pills"><span class="footer-pill">物理键位精准映射</span><span class="footer-pill">支持自定义 Hex 取色</span></div>
     </div>
    </div>
   </body></html>`
  },
  {
   file:'海报05-今日陪伴日报卡片.png',
   html:`<!doctype html><html><head><meta charset="utf-8"><style>${commonCss}
    .rep-grid{display:grid;grid-template-columns:500px 1fr;gap:48px;flex:1;margin:16px 0;align-items:center}
    .card-stage{display:flex;justify-content:center;align-items:center;position:relative;height:750px}
    .long-card-img{height:742px;width:auto;border-radius:26px;border:2px solid #F0E4CE;box-shadow:0 24px 60px rgba(120,80,40,.18);transform:rotate(-1deg)}
    .rep-info{position:relative}
    .floating-pose{position:absolute;right:0;top:-10px;width:176px;padding:14px;text-align:center;background:rgba(255,253,248,.96)}
    .floating-pose img{width:130px;height:110px;object-fit:contain}
    .rep-info h1{font-size:46px;font-weight:800;line-height:1.2;color:#3E2E20;margin-bottom:16px}
    .rep-info h1 em{font-style:normal;color:#E26B85}
    .rep-info p{font-size:18.5px;color:#786552;line-height:1.65;margin-bottom:26px}
    .highlights{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .hl-card{padding:20px 22px}
    .hl-card b{font-size:18px;display:block;margin-bottom:6px;color:#4A3A2C}
    .hl-card span{font-size:14px;color:#8C7A66;line-height:1.5;display:block}
   </style></head><body>
    <div class="bg-orb" style="width:540px;height:540px;background:#FCEBC8;top:-80px;left:80px"></div>
    <div class="bg-orb" style="width:460px;height:460px;background:#FCE0E6;bottom:-100px;right:-40px"></div>
    <div class="wrap">
     <div class="top-bar">
      <div class="brand-pill"><b>🐾 PetLink</b><span>04 · 一键生成今日陪伴日报长图</span></div>
      <div class="tag-badge">2x Retina 高清长图 · 本地保存 PNG</div>
     </div>
     <div class="rep-grid">
      <div class="card-stage">
       <img class="long-card-img" src="${reportCardDataUrl}">
      </div>
      <div class="rep-info">
       <div class="card floating-pose">
        <img src="${dafeiyuFrames}bonus-031.png">
        <b style="font-size:13px;color:#D95B78;display:block">今日收获满满！</b>
       </div>
       <div style="display:inline-block;background:#FBE3E6;color:#C85A72;padding:6px 16px;border-radius:999px;font-weight:700;font-size:14px;margin-bottom:12px">数据可视化与可分享产出</div>
       <h1>把一天的专注与陪伴，<br>浓缩成一张<em>温暖日报</em>。</h1>
       <p>告别枯燥的数字罗列。PetLink 将你全天的键盘敲击、鼠标点击、滚轮滑动、AI 协同工作时长与桌宠养成进度，一键绘制为 UI2 风格高清长图。</p>
       <div class="highlights">
        <div class="card hl-card">
         <b>✨ 原创趣味物理换算</b>
         <span>自动把敲击与滚轮换算为「指尖在键帽间轻快跃动米数」「释放专注花火千卡」与「滚轮漫游代码长卷距离」。</span>
        </div>
        <div class="card hl-card">
         <b>📈 24 小时活跃节奏曲线</b>
         <span>柱线结合展示 00:00–23:00 每小时键鼠活跃分布，自动识别你全天灵感最旺盛的黄金时段。</span>
        </div>
        <div class="card hl-card">
         <b>🤖 AI 协同工作汇总</b>
         <span>统计当日 AI 助手累计协同工作时长与任务完成次数，直观回顾人机搭档产出。</span>
        </div>
        <div class="card hl-card">
         <b>🔒 纯本地导出 · 零社交绑架</b>
         <span>自动跟随当前选中的主题皮肤配色，一键导出高清 PNG 文件到本地，无任何内置社交平台上传。</span>
        </div>
       </div>
      </div>
     </div>
     <div class="footer-bar">
      <span>日报卡片分辨率：1440 × 2160 (2x Retina Canvas 实时渲染)</span>
      <div class="footer-pills"><span class="footer-pill">支持随皮肤自动换色</span><span class="footer-pill">数据 100% 源自本机 SQLite</span></div>
     </div>
    </div>
   </body></html>`
  },
  {
   file:'海报06-隐私皮肤与百段动作生态.png',
   html:`<!doctype html><html><head><meta charset="utf-8"><style>${commonCss}
    .eco-grid{display:grid;grid-template-columns:1.1fr 0.9fr;gap:32px;flex:1;margin:16px 0;align-items:stretch}
    .poses-card{padding:24px;display:flex;flex-direction:column;justify-content:space-between}
    .poses-matrix{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px;flex:1}
    .pose-cell{background:#FBF6EC;border:1.5px solid #F0E4CE;border-radius:18px;padding:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .pose-cell img{width:170px;height:112px;object-fit:contain}
    .pose-cell span{font-size:13px;font-weight:700;color:#5C4A3A;margin-top:4px}
    .right-col{display:flex;flex-direction:column;justify-content:space-between;gap:16px}
    .skin-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:10px}
    .skin-box{padding:14px;border-radius:18px;border:2px solid;text-align:center}
    .skin-box b{display:block;font-size:15px;margin-bottom:6px}
    .swatch-row{display:flex;justify-content:center;gap:6px}
    .swatch{width:22px;height:22px;border-radius:50%;border:1px solid rgba(0,0,0,.1)}
    .sql-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;background:#2D2620;color:#F8EAD8;padding:14px 16px;border-radius:16px;line-height:1.5;margin-top:10px}
   </style></head><body>
    <div class="bg-orb" style="width:480px;height:480px;background:#E5F6EE;top:-100px;left:-60px"></div>
    <div class="bg-orb" style="width:480px;height:480px;background:#EFEAFB;bottom:-100px;right:-60px"></div>
    <div class="wrap">
     <div class="top-bar">
      <div class="brand-pill"><b>🐾 PetLink</b><span>05 · 角色动作生态 · 主题皮肤 · 隐私红线</span></div>
      <div class="tag-badge">大肥鱼 106 段透明动画 · 3 套主题皮肤 · SQLite 隐私自证</div>
     </div>
     <div class="eco-grid">
      <div class="card poses-card">
       <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
         <b style="font-size:22px;color:#3E2E20">🐟 原创 IP「大肥鱼」106 段透明通道动作库</b>
         <p style="font-size:14px;color:#8C7A66;margin-top:2px">涵盖五态工作、5 种摸摸反馈、7 类美食投喂吃法及 85 段日常彩蛋动作，支持导入自定义角色包</p>
        </div>
       </div>
       <div class="poses-matrix">
        <div class="pose-cell"><img src="${dafeiyuFrames}action-idle.png"><span>待机呼吸休闲</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}action-working.png"><span>专注写代码</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}bonus-003.png"><span>骑木马摇摆</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}bonus-013.png"><span>蓝鲸现世特效</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}bonus-026.png"><span>开心涮火锅</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}eat-candy.png"><span>吃冰糖葫芦</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}bonus-031.png"><span>绚烂放烟花</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}bonus-035.png"><span>温柔撸小猫</span></div>
        <div class="pose-cell"><img src="${dafeiyuFrames}action-drag.png"><span>鼠标拖拽悬空</span></div>
       </div>
      </div>
      <div class="right-col">
       <div class="card" style="padding:22px">
        <b style="font-size:20px;color:#3E2E20">🎨 内置 3 套可切换主题皮肤 + 21 种美食商店</b>
        <p style="font-size:13.5px;color:#8C7A66;margin-top:4px">抽取统一 CSS 主题变量，一键切换控制窗、桌宠气泡与日报卡片风格；完成任务赢取积分投喂大肥鱼。</p>
        <div class="skin-cards">
         <div class="skin-box" style="background:#FBF6EC;border-color:#F28CA0;color:#5C4A3A">
          <b>🍑 蜜桃米白</b>
          <div class="swatch-row"><span class="swatch" style="background:#FBF6EC"></span><span class="swatch" style="background:#F6A8B8"></span><span class="swatch" style="background:#FCEBC8"></span></div>
         </div>
         <div class="skin-box" style="background:#F2F9F5;border-color:#52AD8E;color:#2D4A3E">
          <b>🌿 薄荷奶绿</b>
          <div class="swatch-row"><span class="swatch" style="background:#F2F9F5"></span><span class="swatch" style="background:#52AD8E"></span><span class="swatch" style="background:#DDF3E8"></span></div>
         </div>
         <div class="skin-box" style="background:#F5F2FA;border-color:#8E74D1;color:#3E3456">
          <b>🔮 芋泥星夜</b>
          <div class="swatch-row"><span class="swatch" style="background:#F5F2FA"></span><span class="swatch" style="background:#8E74D1"></span><span class="swatch" style="background:#EAE3F8"></span></div>
         </div>
        </div>
       </div>
       <div class="card" style="padding:22px;flex:1;display:flex;flex-direction:column;justify-content:space-between">
        <div>
         <b style="font-size:20px;color:#3E2E20">🔒 数据库结构级隐私自证（Privacy by Schema）</b>
         <p style="font-size:13.5px;color:#8C7A66;margin-top:4px">只记次数与时间桶，绝不记录输入内容、按键顺序或窗口标题。所有 SQLite 表均声明 WITHOUT ROWID，按主键字典序存储，从底层物理结构上杜绝还原按键序列：</p>
         <div class="sql-code">CREATE TABLE daily_key_counts (<br>  day TEXT NOT NULL,<br>  key_id TEXT NOT NULL,<br>  count INTEGER NOT NULL DEFAULT 0,<br>  PRIMARY KEY (day, key_id)<br>) WITHOUT ROWID; -- 零时间戳 · 零自增序号 · 零内容字段</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:#FCEBC8;color:#8A6420;padding:10px 16px;border-radius:14px;font-weight:700;font-size:13.5px">
         <span>✓ 不联网 · 不注册 · 不上传</span>
         <span>✓ verifyPrivacySchema() 启动自检</span>
        </div>
       </div>
      </div>
     </div>
     <div class="footer-bar">
      <span>开放角色包规范（manifest.json + WebM/PNG）· 欢迎社区贡献更多原创角色与皮肤</span>
      <div class="footer-pills"><span class="footer-pill">Clean-Room 原创代码</span><span class="footer-pill">MIT / 开源友好架构</span></div>
     </div>
    </div>
   </body></html>`
  }
 ];

 for(const p of posters){
  await poster.eval(`document.open();document.write(${JSON.stringify(p.html)});document.close();`);
  await sleep(400);
  await poster.eval(`(async()=>{
   await Promise.all(Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;})));
   for(const img of Array.from(document.images)){
    if(!img.src.startsWith('file://')||!img.naturalWidth)continue;
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    const {data,width,height}=ctx.getImageData(0,0,c.width,c.height);
    let minX=width,minY=height,maxX=0,maxY=0;
    for(let y=0;y<height;y++){
     for(let x=0;x<width;x++){
      if(data[(y*width+x)*4+3]>20){
       if(x<minX)minX=x;if(x>maxX)maxX=x;
       if(y<minY)minY=y;if(y>maxY)maxY=y;
      }
     }
    }
    if(maxX>minX&&maxY>minY){
     const pad=6;
     const sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad);
     const sw=Math.min(width-sx,maxX-minX+1+pad*2),sh=Math.min(height-sy,maxY-minY+1+pad*2);
     const out=document.createElement('canvas');out.width=sw;out.height=sh;
     out.getContext('2d').drawImage(c,sx,sy,sw,sh,0,0,sw,sh);
     img.src=out.toDataURL('image/png');
    }
   }
   await Promise.all(Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;})));
  })()`);
  await sleep(200);
  const outPath=path.join(outDir,p.file);
  await poster.capture(outPath,{x:0,y:0,width:1600,height:1000,scale:1});
  await copyFile(outPath,path.join(artifactDir,p.file));
  console.log('Rendered poster:',outPath);
 }
}finally{
 for(const c of clients)try{c.close();}catch{}
 try{process.kill(-child.pid,'SIGTERM');}catch{}
 await sleep(400);
}
