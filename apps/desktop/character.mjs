export const STATE_ACTION = Object.freeze({idle:'idle',working:'typing',waiting:'waiting',done:'jump',error:'fail',offline:'sleep-loop',pet:'pet',drag:'drag',sleep:'sleep'});
export function validateManifest(m) {
 const errors=[];
 for(const key of ['id','name','author','version','license']) if(typeof m?.[key]!=='string'||!m[key].trim()) errors.push(`缺少 ${key}`);
 if(!m?.anchor||!['x','y'].every(k=>Number.isFinite(m.anchor[k])&&m.anchor[k]>=0&&m.anchor[k]<=1)) errors.push('anchor 必须为 0–1 的 x/y');
 if(!Number.isFinite(m?.scale)||m.scale<=0) errors.push('scale 必须为正数');
 for(const state of new Set([...Object.keys(STATE_ACTION),...Object.keys(m?.states||{})])) {
  const actions=m?.states?.[state];
  if(!actions&&['pet','drag','sleep'].includes(state)) continue;
  if(!Array.isArray(actions)||!actions.length) {errors.push(`缺少 states.${state}`);continue;}
  for(const a of actions) {
   if(!a||typeof a.name!=='string'||!Number.isFinite(a.fps)||a.fps<=0||a.fps>120||typeof a.loop!=='boolean') errors.push(`${state} 动作参数无效`);
   if(a?.motion!==undefined&&(a.motion!=='plush-idle-v1'||(a.fps>0&&a.fps<60)||a.loop!==true||a.durationMs!==8000||a.frames?.length!==1))errors.push(`${state} 连续待机动作需要 60 FPS、8 秒循环和一张底图`);
   if(a?.clip!==undefined&&(typeof a.clip!=='string'||!m.clips?.[a.clip]||(a.fps>0&&a.fps<60)||typeof a.loop!=='boolean'||a.durationMs!==m.clips?.[a.clip]?.durationMs))errors.push(`${state} 视频动作需要有效片段、60 FPS 和一致的循环时长`);
   if(!Array.isArray(a?.frames)||!a.frames.length||a.frames.some(f=>typeof f!=='string'||!/^frames\/[a-zA-Z0-9_/-]+\.(webp|png)$/.test(f)||f.split('/').includes('..'))) errors.push(`${state} 必须使用包内逐帧 WebP/PNG`);
  }
 }
 for(const state of ['idle','working','waiting','done','error','offline']) if(m?.lines?.[state]!==undefined&&(!Array.isArray(m?.lines?.[state])||m.lines[state].length<8||m.lines[state].length>12||m.lines[state].some(x=>typeof x!=='string'))) errors.push(`${state} 需要 8–12 条台词`);
 const safe=f=>typeof f==='string'&&/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(webp|png|webm)$/.test(f);
 if(m?.clips!==undefined){if(!m.clips||Array.isArray(m.clips)||typeof m.clips!=='object')errors.push('clips 无效');else for(const c of Object.values(m.clips))if(!c||!safe(c.file)||!c.file.endsWith('.webm')||!Number.isFinite(c.durationMs)||c.durationMs<=0||!Array.isArray(c.fallbackFrames)||!c.fallbackFrames.length||c.fallbackFrames.some(f=>!safe(f)||! /\.(webp|png)$/.test(f)))errors.push('clip 路径或参数无效');}
 if(m?.emotions!==undefined&&(!Array.isArray(m.emotions)||m.emotions.some(e=>!e||typeof e.name!=='string'||!safe(e.file)||! /\.(webp|png)$/.test(e.file))))errors.push('表情路径无效');
 return errors;
}
export function animationState(state,{sleep=false,interaction=null}={}) {return interaction|| (state==='idle'&&sleep?'sleep':state);}
export function frameAt(action,elapsed) {const i=Math.floor(Math.max(0,elapsed)*action.fps/1000);return action.loop?i%action.frames.length:Math.min(i,action.frames.length-1);}
