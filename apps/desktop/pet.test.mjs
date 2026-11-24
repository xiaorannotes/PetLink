import {displayAction} from './pet-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {petData} from './pet-data.mjs';
import {animationState,frameAt} from './character.mjs';
test('pet registers drag, pat and menu listeners despite failed or pending initial snapshot',async()=>{
 const source=(await readFile(new URL('./pet.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 for(const request of [()=>Promise.reject(Error('snapshot offline')),()=>new Promise(()=>{}),()=>{throw Error('IPC unavailable');}]){
  const handlers={},calls=[],bubble={};
  const img={style:{},addEventListener:(name,fn)=>handlers[name]=fn,setPointerCapture:()=>{}};
  const video={pause:()=>{}};
  const main={classList:{toggle:()=>{},add:()=>{},remove:()=>{}}};
  vm.runInNewContext(source,{displayAction,createPoseTransition:()=>({capture:()=>{},reveal:()=>{}}),createIdleMotion:()=>({draw:()=>false,hide:()=>{}}),petData,animationState,frameAt,performance,requestAnimationFrame:()=>{},document:{querySelector:selector=>({img,'#bubble':bubble,main,video})[selector],addEventListener:(name,fn)=>handlers[name]=fn},window:{petlink:{onPlay:()=>{},subscribe:fn=>{fn({});},call:(command,arg)=>{if(command==='snapshot')return request();calls.push([command,arg]);return Promise.resolve();}}}});
  await new Promise(resolve=>setImmediate(resolve));
  for(const name of ['pointerdown','pointermove','pointerup','pointercancel','contextmenu'])assert.equal(typeof handlers[name],'function');
  handlers.pointerdown({button:0,screenX:1,screenY:2,pointerId:1});handlers.pointerup();assert.equal(bubble.textContent,'摸摸收到啦');
  handlers.pointerdown({button:0,screenX:1,screenY:2,pointerId:1});handlers.pointermove({screenX:6,screenY:8});handlers.pointerup();
  handlers.contextmenu({preventDefault:()=>{}});assert.deepEqual(calls.map(x=>x[0]),['move','menu']);
 }
});
