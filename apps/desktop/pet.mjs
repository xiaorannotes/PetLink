import {displayAction} from './pet-state.mjs';
import {createPoseTransition} from './pose-transition.mjs';
import {lookTransform} from './look.mjs';
import {petData} from './pet-data.mjs';
import {animationState,frameAt} from './character.mjs';
import {createIdleMotion} from './idle-motion.mjs';
const img=document.querySelector('img'),bubble=document.querySelector('#bubble'),main=document.querySelector('main'),floatLayer=document.querySelector('#float-layer');
const idleMotion=createIdleMotion(img);
let manual=null,playGeneration=0;
const video=document.querySelector('video');
const transition=createPoseTransition(img,video);
let loopingVideo='',completedVideo='',decodedVideo='';
let computerIdleSeconds=0,userActivityState=null,petActionIndex=0,lastPetIndex=-1;
let floatIndex=0,lastFloatAt=0;
const floatPhrases=['灵感 +1 ✨','码力 +1 ⚡','敲敲 ~ 🐾','顺畅 +1 🌸','专注 +1 💡','好耶 +1 🍑'];
const failedLoops=new Set();
function spawnFloatingFeedback(){
 if(!floatLayer||!document.createElement)return;
 if(data?.settings?.typingFloatEnabled===false)return;
 const now=performance.now();if(now-lastFloatAt<220)return;lastFloatAt=now;
 const badge=document.createElement('span');badge.className='float-badge';
 badge.textContent=floatPhrases[floatIndex++%floatPhrases.length];
 const offsetX=42+((floatIndex*17)%20);
 const b=bubble.getBoundingClientRect?.();
 badge.style.left=offsetX+'%';
 badge.style.top=b&&b.height>0?(b.bottom+22)+'px':'34%';
 floatLayer.append(badge);
 setTimeout(()=>badge.remove(),900);
}
function stopLoop(){if(!loopingVideo)return;loopingVideo='';decodedVideo='';video.pause();video.hidden=true;video.loop=false;video.onerror=null;img.style.visibility='visible';img.style.opacity='';}
function playLoop(a){
 const clip=data.character.manifest.clips?.[a.clip];if(!clip)return false;
 const url=data.character.base+clip.file;if(failedLoops.has(url)||completedVideo===url)return false;
 idleMotion.hide();
 if(loopingVideo!==url){
  loopingVideo=url;decodedVideo='';video.loop=a.loop;video.muted=true;
  video.onended=()=>{if(!a.loop&&loopingVideo===url){completedVideo=url;interactionUntil=0;if(manual?.clip===a.clip){manual=null;current='';}}};
  const failed=()=>{failedLoops.add(url);if(loopingVideo===url)stopLoop();};
  video.onerror=failed;video.onloadedmetadata=()=>{if(loopingVideo===url&&a.startAtMs)video.currentTime=a.startAtMs/1000;};video.src=url;video.play().catch(failed);
 }
 // During a loop seek Chromium can briefly drop readyState. Keep the last
 // decoded video pose instead of flashing the fallback standing image.
 if(video.readyState>=2)decodedVideo=url;
 const ready=decodedVideo===url;video.hidden=!ready;img.style.visibility='visible';img.style.opacity=ready?'0':'';return true;
}
window.petlink.onPlay(event=>{
 transition.capture();completedVideo='';
 stopLoop();video.loop=false;
 idleMotion.hide();
 const generation=++playGeneration;video.onended=null;video.onerror=null;video.pause();video.hidden=true;img.style.visibility='visible';img.style.opacity='';manual=null;
 const m=data.character.manifest,base=data.character.base;
 const finish=()=>{if(generation!==playGeneration)return;manual=null;video.hidden=true;img.style.visibility='visible';img.style.opacity='';current='';};
 if(event.type==='clip'){const c=m.clips?.[event.id];if(!c)return;let fellBack=false;const fallback=()=>{if(generation!==playGeneration||fellBack)return;fellBack=true;video.pause();video.hidden=true;img.style.visibility='visible';img.style.opacity='';manual={frames:c.fallbackFrames,fps:c.fallbackFrames.length*1000/c.durationMs,start:performance.now(),duration:c.durationMs};};video.onended=finish;video.onerror=fallback;video.src=base+c.file;video.hidden=false;img.style.visibility='visible';img.style.opacity='0';transition.reveal();manual={video:true,start:performance.now(),duration:c.durationMs+2000,onTimeout:fallback};video.play().catch(fallback);}
 if(event.type==='state'){const a=m.states[event.id]?.[event.index||0];if(a)manual={...a,start:performance.now(),duration:(a.durationMs||a.frames.length/a.fps*1000)+(a.clip?1000:0)};}
 if(event.type==='emotion'){const e=m.emotions?.[event.index];if(e)manual={frames:[e.file],fps:1,start:performance.now(),duration:3000};}
});
let data,current='',action,start=performance.now(),lastEvent=Date.now(),eventStamp=0,interaction=null,interactionUntil=0,drag=null,oldState='',oldChatBusy=false;
function update(s){
 s=petData(s);
 if(document.documentElement?.dataset)document.documentElement.dataset.theme=s.settings?.theme||'peach';
 main.classList.toggle('click-through',!!s.settings?.clickThrough);
 if(s.activity?.state)userActivityState=s.activity.state;
 if(Number.isFinite(s.activity?.idleSeconds))computerIdleSeconds=s.activity.idleSeconds;
 if(data?.character.base!==s.character.base){current='';manual=null;playGeneration++;if(video){video.pause();video.hidden=true;}img.style.visibility='visible';img.style.opacity='';}
 data=s;
 const stamp=Math.max(0,...s.sessions.map(x=>x.lastSeen));if(stamp!==eventStamp){eventStamp=stamp;lastEvent=Date.now();}
 main.classList.toggle('quiet',s.aggregate.quiet);
 img.style.objectPosition=`${s.character.manifest.anchor.x*100}% ${s.character.manifest.anchor.y*100}%`;
 img.style.transform=`scale(${s.character.manifest.scale})`;
 img.style.transformOrigin=`${s.character.manifest.anchor.x*100}% ${s.character.manifest.anchor.y*100}%`;
 if(oldState!==s.aggregate.state||oldChatBusy!==!!s.chat?.busy){
  oldState=s.aggregate.state;oldChatBusy=!!s.chat?.busy;
  const lines=s.character.manifest.lines?.[oldState]||{idle:['陪你歇一会儿'],working:['正在努力呀'],waiting:['等你确认'],done:['完成啦'],error:['好像出错了'],offline:['先休息一下']}[oldState];
  bubble.textContent=oldState==='waiting'?(s.chat?.busy?'想想哦……':'等你确认'):lines?.length?lines[Math.floor(Math.random()*lines.length)]:'陪你歇一会儿';
 }
}
window.petlink.subscribe(update);update(null);
// Never hold listener registration behind a pending or rejected IPC request.
function tick(now){if(manual){if(now-manual.start>=manual.duration){if(manual.onTimeout){manual.onTimeout();requestAnimationFrame(tick);return;}manual=null;stopLoop();video.pause();video.hidden=true;img.style.visibility='visible';img.style.opacity='';current='';}else{if(!manual.video){const url=data.character.base+manual.frames[Math.min(manual.frames.length-1,Math.floor((now-manual.start)*manual.fps/1000))];if(manual.clip&&playLoop(manual)){}else{stopLoop();if(manual.motion==='plush-idle-v1')idleMotion.draw(url,now-manual.start,data.character.manifest,manual);else idleMotion.hide();}if(img.getAttribute('src')!==url)img.src=url;if((!video.hidden&&video.readyState>=2)||(video.hidden&&img.complete))transition.reveal();}requestAnimationFrame(tick);return;}}if(data){if(interaction&&now>interactionUntil&&!drag){interaction=null;main.classList.remove('pat');}const state=data.aggregate.state==='idle'&&data.sessions.length&&data.sessions.every(x=>x.state==='offline')?'offline':data.aggregate.state;
 const name=displayAction({state,mode:data.settings?.mode,agentWorking:data.agentWorking,keyboardIdleSeconds:computerIdleSeconds,userActivity:userActivityState,awayThresholdSeconds:300,interaction});const key=[data.character.base,data.character.manifest.id||'boot',data.character.manifest.version||'',name].join('|');
 if(current!==key){completedVideo='';transition.capture();if(name==='sleep')bubble.textContent='呼……睡一小会儿';else if(!interaction)bubble.textContent=(data.character.manifest.lines?.[name]||data.character.manifest.lines?.[state])?.[0]||'陪你歇一会儿';current=key;action=(data.character.manifest.states[name]||data.character.manifest.states.idle)[name==='pet'?petActionIndex:0];start=now;}
 let a=action,elapsed=now-start;
 if(name==='error'&&!a.clip&&elapsed>=a.frames.length/a.fps*1000){a=data.character.manifest.states.idle[0];elapsed-=action.frames.length/action.fps*1000;}
 const url=data.character.base+a.frames[frameAt(a,elapsed)];
 if(a.clip&&playLoop(a)){}else{
  stopLoop();
  if(a.motion==='plush-idle-v1')idleMotion.draw(url,elapsed,data.character.manifest,a);else idleMotion.hide();
 }
 if(img.getAttribute('src')!==url)img.src=url;if((!video.hidden&&video.readyState>=2)||(video.hidden&&img.complete))transition.reveal();
 }requestAnimationFrame(tick);}requestAnimationFrame(tick);
// Native app-region movement may bypass renderer events entirely. These samples
// diagnose the no-drag regions; main owns the shared per-boot disk budget.
let diagnosticMoves=0,diagnosticLines=0;
for(const name of ['pointerdown','pointermove','pointerup','pointercancel','dragstart','contextmenu','dblclick']){
 document.addEventListener(name,e=>{
  if(name==='pointermove'&&++diagnosticMoves%20!==0)return;
  if(diagnosticLines++>=60)return;
  const target=e.target===img?'img':e.target===bubble?'bubble':'main';
  window.petlink.dragLog?.({event:name,target,screenX:e.screenX,screenY:e.screenY,count:name==='pointermove'?diagnosticMoves:undefined});
 },true);
}
// Native image drag cancels the pointer stream, including captured pointers.
img.addEventListener('dragstart',e=>e.preventDefault());
function startDrag(e,surface){
 if(e.button!==0)return;
 drag={x:e.screenX,y:e.screenY,pointerId:e.pointerId,moved:false,surface};
 surface.setPointerCapture?.(e.pointerId);
}
function moveDrag(e){
 if(!drag||e.buttons===0)return;
 if(drag.pointerId!==undefined&&e.pointerId!==undefined&&e.pointerId!==drag.pointerId)return;
 const x=e.screenX-drag.x,y=e.screenY-drag.y;
 if(drag.moved||Math.abs(x)+Math.abs(y)>2){
  const start=!drag.moved;drag.moved=true;interaction='drag';interactionUntil=Infinity;
  window.petlink.call('move',{x,y,mode:'absolute',start});
 }
}
img.addEventListener('pointerdown',e=>startDrag(e,img));
img.addEventListener('pointermove',moveDrag);
bubble.addEventListener?.('pointerdown',e=>startDrag(e,bubble));
bubble.addEventListener?.('pointermove',moveDrag);
function release(){
 if(!drag)return;const moved=drag.moved;drag=null;
 window.petlink.dragEnd?.();
 if(moved){interaction=null;return;}
 // Repeated touches during a response do not restart or queue more responses.
 if(manual||(interaction==='pet'&&performance.now()<interactionUntil))return;
 const choices=data?.character.manifest.states.pet||[];petActionIndex=choices.length?(lastPetIndex+1)%choices.length:0;lastPetIndex=petActionIndex;
 const response=choices[petActionIndex];
 interaction='pet';interactionUntil=performance.now()+(response?.durationMs||900)+(response?.clip?1000:0);
 current='';main.classList.add('pat');bubble.textContent='摸摸收到啦';
}
img.addEventListener('pointerup',release);img.addEventListener('pointercancel',release);
bubble.addEventListener?.('pointerup',release);bubble.addEventListener?.('pointercancel',release);
document.addEventListener('contextmenu',e=>{e.preventDefault();menuOpen=true;Promise.resolve(window.petlink.call('menu')).finally(()=>menuOpen=false);});

Promise.resolve().then(()=>window.petlink.call('snapshot')).then(update).catch(()=>update(null));

img.addEventListener('dblclick',()=>window.petlink.call('chat-open'));
let menuOpen=false;
let lastMouseIgnored=null;
const hitCanvas=document.createElement?.('canvas');
if(hitCanvas){hitCanvas.width=1;hitCanvas.height=1;}
const hitCtx=hitCanvas?.getContext?.('2d',{willReadFrequently:true});
function hitTestPoint(clientX,clientY){
 if(drag||menuOpen)return true;
 const br=bubble.getBoundingClientRect?.();
 if(br&&clientX>=br.left&&clientX<=br.right&&clientY>=br.top&&clientY<=br.bottom)return true;
 const src=!video.hidden&&video.readyState>=2?video:img;
 const sr=src.getBoundingClientRect?.();
 if(!sr||clientX<sr.left||clientX>sr.right||clientY<sr.top||clientY>sr.bottom)return false;
 const nw=src.videoWidth||src.naturalWidth||0,nh=src.videoHeight||src.naturalHeight||0;
 if(!nw||!nh||!hitCtx)return true;
 const scale=Math.min(sr.width/nw,sr.height/nh);
 const rw=nw*scale,rh=nh*scale;
 const ox=sr.left+(sr.width-rw)*0.5;
 const oy=sr.top+(sr.height-rh)*1.0;
 if(clientX<ox||clientX>ox+rw||clientY<oy||clientY>oy+rh)return false;
 const sx=Math.max(0,Math.min(nw-1,Math.floor((clientX-ox)/scale)));
 const sy=Math.max(0,Math.min(nh-1,Math.floor((clientY-oy)/scale)));
 try{
  hitCtx.clearRect(0,0,1,1);
  hitCtx.drawImage(src,sx,sy,1,1,0,0,1,1);
  return hitCtx.getImageData(0,0,1,1).data[3]>24;
 }catch{return true;}
}
if(window.petlink.setMouseIgnore){
 document.addEventListener('pointermove',e=>{
  const ignore=!hitTestPoint(e.clientX,e.clientY);
  if(ignore!==lastMouseIgnored){lastMouseIgnored=ignore;window.petlink.setMouseIgnore(ignore);}
 });
 document.addEventListener('pointerleave',()=>{
  if(!drag&&!menuOpen&&lastMouseIgnored!==true){lastMouseIgnored=true;window.petlink.setMouseIgnore(true);}
 });
}
window.petlink.onActivity?.(point=>{
 if(Number.isFinite(point.keyboardIdleSeconds))computerIdleSeconds=point.keyboardIdleSeconds;
 if(typeof point.userActivity==='string')userActivityState=point.userActivity;
 if(point.keystrokePulse)spawnFloatingFeedback();
});
