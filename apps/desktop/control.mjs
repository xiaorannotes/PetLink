import {renderChat} from './chat-view.mjs';
import {DEFAULT_PROMPT} from './chat-prompt.mjs';
import {renderHeatmapView} from './heatmap-view.mjs';
import {renderReportView} from './report-card.mjs';
import {THEMES,THEME_IDS,applyThemeToDocument} from './themes.mjs';

window.petlink.onBootReport(report=>{const banner=document.getElementById('boot-report');banner.hidden=!report.length;banner.textContent=report.length?'启动未完全成功：'+report.map(s=>`${s.label}失败（${s.error}）`).join('；')+'。其余功能可正常使用；如需排查，请把程序目录下的 boot.log 发回。':'';});
const $=id=>document.getElementById(id);let data,initialized=false,lastPage=null;
const names={antigravity:'Antigravity','claude-code':'Claude Code',codex:'Codex',cursor:'Cursor',deepseek:'DeepSeek（网页扩展）','doubao-pro':'豆包专业版（网页扩展）',muse:'Muse（网页扩展）',grokbot:'Grok / GrokBot（网页扩展）',workbuddy:'WorkBuddy',generic:'通用接入'};
const states={idle:'休息中',working:'工作中',waiting:'等你确认',done:'已完成',error:'出错',offline:'离线'};
const activityNames={active:'活跃打字',idle:'空闲待机',away:'离开休息'};
async function call(command,arg){const result=await window.petlink.call(command,arg);if(result?.ok===false)$('message').textContent=result.message||'操作失败';else $('message').textContent='已完成';return result;}
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function button(label,handler){const b=text('button',label);b.onclick=handler;return b;}
const iconPaths={
 link:'M9 15l6-6 M8 17H6a4 4 0 0 1-3-7l4-4a4 4 0 0 1 6 0 M16 7h2a4 4 0 0 1 3 7l-4 4a4 4 0 0 1-6 0',
 grid:'M3 5h18v14H3z M7 9h2 M11 9h2 M15 9h2 M7 13h2 M11 13h2 M15 13h2 M8 17h8',
 card:'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M7 8h10 M7 12h6 M7 16h10',
 heart:'M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 3 11 8 15 5-4 13-10 8-15Z',
 star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
 paw:'M7 14c-5 6 0 8 5 5 5 3 10 1 5-5-3-4-7-4-10 0Z M5 5v3 M10 3v4 M15 3v4 M20 5v3',
 bell:'M5 17h14l-2-4V9a5 5 0 0 0-10 0v4Z M10 21h4',
 chat:'M4 4h16v12H9l-5 4Z',
 wrench:'M14 4a6 6 0 0 0-7 8l-4 5a3 3 0 0 0 4 4l5-5a6 6 0 0 0 8-7l-4 4-4-4Z',
 info:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M12 16v-4 M12 8h.01'
};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[name]||iconPaths.star);svg.append(path);return svg;}
const navIcons=['link','grid','card','heart','star','paw','bell','chat','wrench','info'];
for(const [index,b] of [...document.querySelectorAll('nav button')].entries())b.prepend(icon(navIcons[index]||'star'));

function renderThemeControls(s){
 const currentTheme=s.settings?.theme||'lavender';
 applyThemeToDocument(document,currentTheme);
 const select=$('theme');
 if(select&&select.options.length!==THEME_IDS.length){
  select.replaceChildren(...THEME_IDS.map(id=>{const o=text('option',THEMES[id].name);o.value=id;return o;}));
 }
 if(select)select.value=currentTheme;
 const pills=$('header-theme-pills');
 if(pills){
  pills.replaceChildren(...THEME_IDS.map(id=>{
   const t=THEMES[id];
   const b=document.createElement('button');
   b.type='button';
   b.className='theme-pill';
   b.dataset.themeId=id;
   b.setAttribute('aria-pressed',String(currentTheme===id));
   const dot=document.createElement('i');
   dot.style.background=t.brand;
   b.append(dot,document.createTextNode(t.name.replace(/（.*）/,'').trim()));
   b.onclick=()=>call('settings',{theme:id});
   return b;
  }));
 }
}

function toolCards(target,wizard=false){
 target.replaceChildren();
 const modeLabels={
  'hooks+transcript':'官方 Hooks + 本机实时会话日志双通道自动监测',
  'hooks+logs':'官方 Hooks + 本机会话日志双通道自动监测',
  'hooks+app':'官方 Hooks + 桌面应用进程自动监测',
  'app+web':'桌面应用进程自动监测 + 网页版免令牌自动桥接扩展',
  'app+webhook':'桌面应用进程自动监测 + 本机 Webhook/CLI 接口'
 };
 for(const source of Object.keys(names)){
  if(wizard&&!['antigravity','claude-code','codex','cursor'].includes(source))continue;
  const t=data.tools[source],rows=data.sessions.filter(x=>x.source===source),card=document.createElement('article');
  card.className='tool-card '+(t?.installed||rows.length?'enabled':'disabled');
  const toolIcon=text('div','');toolIcon.className='tool-icon';toolIcon.append(icon('link'));
  card.append(toolIcon);card.append(text('h2',names[source]));
  if(source==='generic'){
   card.append(text('p','通用 CLI / HTTP 事件接口（供自定义脚本或流水线调用）'));
   if(data.integrationCommand)card.append(text('code',data.integrationCommand+' send --source generic --state working --session my-app'));
  }else{
   card.append(text('p',`${modeLabels[t?.mode]||'自动状态监测'} · ${t?.installed?'✓ 自动监测已开启':'自动监测已关闭'}`));
  }
  const last=Math.max(0,...rows.map(x=>x.lastSeen));
  card.append(text('p',`当前：${rows.map(x=>states[x.state]).join('、')||(t?.installed?'已就绪（待机监测中）':'未启用')} · 最近事件：${last?new Date(last).toLocaleString('zh-CN'):'等待触发'}`));
  if(t){
   card.append(button(wizard?'同意并启用':t.installed?'停用自动监测':'启用自动监测',async()=>{
    const r=await call('adapter',{source,action:!wizard&&t.installed?'disable':'enable'});
    card.append(text('p',r.ok?'✓ 监测状态已更新':`操作提示：${r.message}`));
   }));
  }
  if(!wizard)card.append(button('测试一下',()=>call('test',{source})));
  target.append(card);
 }
}

function render(s){
 data=s;
 renderThemeControls(s);
 renderMode(s);
 renderChat($('chat-view'),s,call);
 renderTyping(s);
 renderCompanion(s);
 renderHeatmapView($('heatmap-view'),s,call);
 renderReportView($('report-view'),s,call);
 toolCards($('tools'));
 const actState=s.activity?.state||'idle';
 if($('header-activity')){
  $('header-activity').textContent=`人的信号：${activityNames[actState]||'空闲待机'}`;
  $('header-activity').className=`activity-pill activity-${actState}`;
 }
 if(!initialized){
  $('wizard').hidden=s.settings.onboarded||s.settings.mode!=='agent';
  toolCards($('wizard-tools'),true);
  const p=s.settings;
  $('chat-url').value=p.chat.url;$('chat-model').value=p.chat.model;$('chat-prompt').value=p.chat.prompt;
  $('scale').value=p.scale;$('opacity').value=p.opacity;$('sound').checked=p.sound;
  if($('look-at-mouse'))$('look-at-mouse').checked=!!p.lookAtMouse;
  if($('click-through'))$('click-through').checked=!!p.clickThrough;
  if($('typing-float'))$('typing-float').checked=p.typingFloatEnabled!==false;
  $('quiet-start').value=p.quietHours.start;$('quiet-end').value=p.quietHours.end;
  for(const state of ['waiting','done','error'])$('notify-'+state).checked=p.notifications.includes(state);
  $('webhook-enabled').checked=p.webhookEnabled;$('webhook-url').value=p.webhookUrl;$('webhook-headers').value=JSON.stringify(p.webhookHeaders,null,2);
  initialized=true;
 }else{
  if($('look-at-mouse'))$('look-at-mouse').checked=!!s.settings.lookAtMouse;
  if($('click-through'))$('click-through').checked=!!s.settings.clickThrough;
  if($('typing-float'))$('typing-float').checked=s.settings.typingFloatEnabled!==false;
 }
 if($('character').options.length!==s.characters.length){
  $('character').replaceChildren(...s.characters.map(c=>{const o=text('option',c.name);o.value=c.id;return o;}));
 }
 $('character').value=s.settings.character;
 $('scale-value').textContent=Math.round(s.settings.scale*100)+'%';
 $('hub').textContent=`Hub 端口：${s.port} · 令牌：${s.token} · 活动库：${s.activityStats?.dbPath||'activity.sqlite'}`;
 $('logs').textContent=JSON.stringify(s.log,null,2);
 $('sessions').replaceChildren(...s.sessions.map(x=>{
  const p=text('p',`${names[x.source]||x.source} · ${x.session} · ${states[x.state]}${x.quiet?' · 安静':''}${x.suspectedEnded?' · 疑似结束':''}`);
  p.className='session state-'+x.state;
  return p;
 }));
}

for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>{
 for(const p of document.querySelectorAll('main>section'))p.hidden=p.id!==b.dataset.page;
 for(const n of document.querySelectorAll('[data-page]'))n.setAttribute('aria-current',String(n===b));
 if(b.dataset.page==='report'&&data)renderReportView($('report-view'),data,call);
 if(b.dataset.page==='heatmap'&&data)renderHeatmapView($('heatmap-view'),data,call);
};

window.petlink.subscribe(render);render(await window.petlink.call('snapshot'));
$('skip').onclick=async()=>{await call('settings',{onboarded:true});$('wizard').hidden=true;};
for(const key of ['scale','opacity'])$(key).oninput=()=>call('settings',{[key]:Number($(key).value)});
$('sound').onchange=()=>call('settings',{sound:$('sound').checked});
if($('look-at-mouse'))$('look-at-mouse').onchange=()=>call('settings',{lookAtMouse:$('look-at-mouse').checked});
if($('click-through'))$('click-through').onchange=()=>call('settings',{clickThrough:$('click-through').checked});
if($('typing-float'))$('typing-float').onchange=()=>call('settings',{typingFloatEnabled:$('typing-float').checked});
if($('theme'))$('theme').onchange=()=>call('settings',{theme:$('theme').value});
for(const id of ['quiet-start','quiet-end'])$(id).onchange=()=>call('settings',{quietHours:{start:$('quiet-start').value,end:$('quiet-end').value}});
$('character').onchange=()=>call('settings',{character:$('character').value});$('import').onclick=()=>call('import');
for(const state of ['waiting','done','error'])$('notify-'+state).onchange=()=>call('settings',{notifications:['waiting','done','error'].filter(x=>$('notify-'+x).checked)});
$('save-webhook').onclick=()=>{try{call('settings',{webhookEnabled:$('webhook-enabled').checked,webhookUrl:$('webhook-url').value,webhookHeaders:JSON.parse($('webhook-headers').value)});}catch{$('message').textContent='自定义头不是有效 JSON';}};
$('test-notification').onclick=()=>call('test',{source:'generic',state:'done'});$('clear').onclick=()=>call('clear');$('export').onclick=()=>call('export');
if($('copy-token'))$('copy-token').onclick=async()=>{await call('copy-token');$('message').textContent='✓ 已复制本机完整令牌到剪贴板';};
if($('copy-wechat'))$('copy-wechat').onclick=async()=>{try{await navigator.clipboard.writeText('XiaoRanNotes');$('message').textContent='✓ 已复制定制微信号：XiaoRanNotes';}catch{$('message').textContent='定制微信号：XiaoRanNotes（请手动复制）';}};
if($('open-ext'))$('open-ext').onclick=()=>call('open-extension');

function renderCompanion(s){
 const c=s.companion;if(!c)return;
 $('header-status').textContent=states[s.aggregate.state];$('header-status').className='state-'+s.aggregate.state;
 const avatarSource=s.character.base+s.character.manifest.states.idle[0].frames[0];$('brand-avatar').src=avatarSource;
 const hero=text('div','');hero.className='status-hero';
 const avatar=document.createElement('img');
 avatar.src=s.character.base+(s.character.manifest.states[s.aggregate.state]?.[0]?.frames[0]||s.character.manifest.states.idle[0].frames[0]);
 avatar.alt=s.character.manifest.name;
 const greeting=text('div','');
 const actState=s.activity?.state||'idle';
 greeting.append(
  text('small',`AI 状态：${states[s.aggregate.state]} · 人的活动：${activityNames[actState]}`),
  text('strong',states[s.aggregate.state]),
  text('p',s.character.manifest.lines?.[s.aggregate.state]?.[0]||({idle:'陪你歇一会儿',working:'正在努力呀',waiting:'等你确认',done:'完成啦',error:'好像出错了',offline:'先休息一下'}[s.aggregate.state]))
 );
 hero.append(avatar,greeting);
 const totals=s.activityStats?.totals||{keystrokes:s.typing?.today||0,clicks:0,wheelSteps:0};
 const metrics=text('div','');metrics.className='metrics';
 metrics.append(...[[c.todayDone,'今日完成'],[c.balance,'积分'],[Math.floor(c.hunger),'饥饿'],[totals.keystrokes,'今日击键']].map(([value,label])=>{
  const card=text('div','');card.append(text('small',label),text('strong',value));return card;
 }));
 const hunger=document.createElement('progress');hunger.setAttribute('aria-label','饥饿');hunger.max=100;hunger.value=c.hunger;metrics.children[2].append(hunger);
 $('overview').replaceChildren(hero,metrics);
 $('economy').replaceChildren();
 const points=text('article','');points.append(icon('star'),text('small','积分'),text('strong',c.balance),text('span',`今日陪伴分 ${c.todayCompanionship}`));
 const appetite=text('article','');appetite.append(text('small','饥饿'),text('strong',`${Math.floor(c.hunger)}/100`));
 const meter=document.createElement('progress');meter.setAttribute('aria-label','饥饿');meter.max=100;meter.value=c.hunger;appetite.append(meter);
 const dayKey=new Date().toLocaleDateString('en-CA');
 const claimed=new Set((c.ledger||[]).filter(e=>e.kind==='milestone'&&e.requestId?.endsWith(':'+dayKey)).map(e=>e.milestoneId));
 const kToday=totals.keystrokes||0;
 const rulesCard=text('article','');
 rulesCard.style.gridColumn='1 / -1';
 rulesCard.style.background='var(--card)';
 rulesCard.style.color='var(--text)';
 rulesCard.append(text('h3','✨ 积分规则与每日专注里程碑'),text('p','每日首次陪伴 +2 分 · AI 任务完成 +3 分 · 达成以下专注里程碑可额外领取积分用于投喂美食：'));
 const msRow=text('div','');msRow.className='chips';
 for(const [id,label,pts,ready] of [
  ['keys-500',`指尖热身：今日击键 ≥500 次 (${Math.min(kToday,500)}/500) +2 分`,2,kToday>=500],
  ['keys-2000',`码力全开：今日击键 ≥2000 次 (${Math.min(kToday,2000)}/2000) +5 分`,5,kToday>=2000],
  ['report-daily','今日复盘：查看/生成今日日报 +2 分',2,true]
 ]){
  const done=claimed.has(id);
  const btn=button(done?`✓ 已领取 · ${label}`:ready?`领取 · ${label}`:`未达成 · ${label}`,()=>call('claim-milestone',{id,points:pts}));
  btn.disabled=done||!ready;
  msRow.append(btn);
 }
 rulesCard.append(msRow);
 $('economy').append(points,appetite,rulesCard);
 $('shop').replaceChildren(...c.catalog.map(f=>{
  const row=text('article','');
  row.dataset.category=/奶|果汁/.test(f.name)&&!/糖/.test(f.name)?'drink':/布丁|蛋糕|冰淇淋|冰激凌|水果/.test(f.name)?'dessert':/饼干|薯片|巧克力|糖/.test(f.name)?'snack':'meal';
  row.append(text('h3',f.name),text('p',`${f.portions}${f.unit} · 每份恢复 ${f.restore}`),text('span',`整包 ${f.price} 分`));
  const b=button(c.balance<f.price?'积分不足':'购买',()=>call('buy',{id:f.id,requestId:crypto.randomUUID()}));
  b.disabled=c.balance<f.price;row.append(b);return row;
 }));
 $('backpack').replaceChildren(...c.catalog.filter(f=>c.backpack[f.id]>0).map(f=>{
  const row=text('article','');row.append(text('h3',f.name),text('p',`剩余 ${c.backpack[f.id]} 份`));
  row.append(button('投喂',()=>call('feed',{id:f.id,requestId:crypto.randomUUID()})));return row;
 }));
 const m=s.character.manifest;const items=[];
 const stateGroup=text('div',''),clipGroup=text('div',''),emotionGroup=text('div','');
 stateGroup.className='chips';clipGroup.className='chips';emotionGroup.className='emotion-grid';
 items.push(text('h2','状态动作'),stateGroup,text('h2','吃法'),clipGroup,text('h2','表情'),emotionGroup);
 for(const [id,actions] of Object.entries(m.states))actions.forEach((a,index)=>stateGroup.append(Object.assign(button(({idle:'安静陪伴','agent-working':'Agent·翻本思考',working:'小键盘工作',waiting:'托脸等你',done:'拍手庆祝',error:'挠头想办法',offline:'爱心挥别',pet:'摸摸回应',drag:'拖动',sleep:'蜷着睡觉'}[id]||id)+(actions.length>1?' '+(index+1):''),()=>call('play',{type:'state',id,index})),{className:'state-'+id})));
 for(const id of Object.keys(m.clips||{}).filter(id=>id.startsWith('eat-')))clipGroup.append(button(({'eat-bowl':'捧碗吃饭','eat-noodles':'吃面条','eat-handheld':'小口吃点心','eat-candy':'吃糖果','eat-drink':'喝饮料','eat-spoon':'用勺子吃','eat-icecream':'吃冰激凌'}[id]||m.clipLabels?.[id]||id),()=>call('play',{type:'clip',id})));
 const bonusClips=Object.keys(m.clips||{}).filter(id=>id.startsWith('bonus-'));
 if(bonusClips.length){
  const bonusGroup=text('div','');bonusGroup.className='chips';
  for(const id of bonusClips)bonusGroup.append(button(m.clipLabels?.[id]||id,()=>call('play',{type:'clip',id})));
  items.push(text('h2',`更多专属动作 (${bonusClips.length} 段)`),bonusGroup);
 }
 for(const [index,e] of (m.emotions||[]).entries()){const row=document.createElement('article'),img=document.createElement('img');img.src=s.character.base+e.file;img.alt=e.name;img.width=100;row.append(img,button(`表情 · ${e.name}`,()=>call('play',{type:'emotion',index})));emotionGroup.append(row);}
 for(const [i,heading] of items.filter(e=>e.tagName==='H2').entries())heading.prepend(icon(['paw','heart','star'][i]));
 $('action-list').replaceChildren(...items);
 if(s.controlPage&&s.controlPageRequest!==lastPage){
  lastPage=s.controlPageRequest;
  document.querySelector(`[data-page="${s.controlPage}"]`)?.click();
  if(s.controlPage==='pets')$('chat-settings').scrollIntoView();
 }
}

function renderTyping(s){
 const card=$('typing-card');
 const totals=s.activityStats?.totals||{keystrokes:s.typing?.today||0,clicks:0,wheelSteps:0};
 const act=s.activity||{state:'idle',idleSeconds:0};
 card.replaceChildren(
  text('h2','键鼠活动信号'),
  text('p',`${s.typing?.connected?'已连接':'未连接'} · 今日击键 ${totals.keystrokes} · 点击 ${totals.clicks} · 滚轮 ${totals.wheelSteps} · 当前：${activityNames[act.state]||'空闲待机'}`),
  text('p','本地 SQLite (WITHOUT ROWID) 按小时与按键聚合：只记次数，绝不记录输入内容、按键顺序或窗口标题。')
 );
 const label=text('label','启用键鼠活动监测');
 const input=document.createElement('input');input.type='checkbox';input.checked=s.settings.typingEnabled;
 input.onchange=()=>call('settings',{typingEnabled:input.checked});label.prepend(input);

 const ptLabel=text('label','桌宠鼠标穿透');
 const ptInput=document.createElement('input');ptInput.type='checkbox';ptInput.checked=!!s.settings.clickThrough;
 ptInput.onchange=()=>call('settings',{clickThrough:ptInput.checked});ptLabel.prepend(ptInput);

 const hmBtn=button('查看键盘热力图',()=>document.querySelector('[data-page="heatmap"]')?.click());
 const rpBtn=button('生成今日日报卡片',()=>document.querySelector('[data-page="report"]')?.click());
 card.append(label,ptLabel,hmBtn,rpBtn);
}

$('chat-save').onclick=async()=>{const chat={url:$('chat-url').value.trim(),model:$('chat-model').value.trim(),prompt:$('chat-prompt').value};if($('chat-key').value)chat.apiKey=$('chat-key').value;const r=await call('settings',{chat});if(r.ok)$('chat-key').value='';};
$('chat-reset').onclick=()=>{$('chat-prompt').value=DEFAULT_PROMPT;};$('chat-clear').onclick=()=>call('chat-clear');

function renderMode(s){
 const agent=s.settings.mode==='agent';
 $('agent-panel').hidden=!agent;
 for(const mode of ['companion','agent'])$('mode-'+mode).setAttribute('aria-pressed',String(s.settings.mode===mode));
 $('mode-description').textContent=agent
  ?'双信号协同：优先响应 AI 任务状态（等待/完成/报错/工作中）；AI 空闲时跟随键鼠打字互动，5 分钟无操作进入离开睡眠。'
  :'日常陪伴：随打字节奏弹出互动浮字；5 分钟无操作进入离开睡眠；收到 AI 完成/报错/等待事件时仍第一优先级提醒。';
 if(initialized)$('wizard').hidden=s.settings.onboarded||!agent;
}
for(const mode of ['companion','agent'])$('mode-'+mode).onclick=()=>call('settings',{mode});
