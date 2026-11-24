import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateManifest,frameAt,animationState,STATE_ACTION} from './character.mjs';
const manifest=JSON.parse(await readFile(new URL('../../characters/xiaodada/manifest.json',import.meta.url)));
test('内置包状态映射与真实动画完整',()=>{assert.deepEqual(validateManifest(manifest),[]);for(const [s,a]of Object.entries(STATE_ACTION))assert.equal(manifest.states[s][0].name,a);for(const s of ['waiting','error','offline']){assert.ok(manifest.states[s][0].clip||manifest.states[s][0].frames.length>=24);assert.ok(!manifest.states[s][0].placeholder);};});
test('缺少字段反馈具体缺项',()=>{const m=structuredClone(manifest);delete m.states.waiting;delete m.author;assert.ok(validateManifest(m).includes('缺少 author'));assert.ok(validateManifest(m).includes('缺少 states.waiting'));});
test('拒绝路径越界、精灵图寻址及空帧',()=>{for(const f of ['../secret.png','/tmp/a.png','frames/x.webp#cell=3','frames/../x.png']){const m=structuredClone(manifest);m.states.idle[0].frames=[f];assert.ok(validateManifest(m).some(x=>x.includes('逐帧')));}});
test('拒绝无效锚点帧率及台词数量',()=>{const m=structuredClone(manifest);m.anchor.x=2;m.states.idle[0].fps=0;m.lines.done=[];assert.equal(validateManifest(m).length,3);});
test('循环按 fps 回绕，单次停在末帧',()=>{const a={fps:24,frames:Array(120),loop:true};assert.equal(frameAt(a,5000),0);assert.equal(frameAt({...a,loop:false},6000),119);assert.equal(frameAt(a,-100),0);});
test('睡眠仅覆盖 idle，互动不修改底层状态',()=>{assert.equal(animationState('idle',{sleep:true}),'sleep');assert.equal(animationState('waiting',{sleep:true}),'waiting');assert.equal(animationState('working',{interaction:'pet'}),'pet');assert.equal(animationState('working'),'working');});
test('real idle video stays at least 60 fps and rejects invalid clip metadata',()=>{
 assert.equal(manifest.states.idle[0].clip,undefined);assert.equal(manifest.states.pet[0].clip,'idle-stretch');assert.equal(manifest.states.pet[0].loop,false);
 assert.ok(manifest.states.idle[0].fps>=60);
 for(const patch of [{fps:24},{durationMs:100},{clip:'unknown'},{loop:null}]){
  const m=structuredClone(manifest);Object.assign(m.states.pet[0],patch);assert.ok(validateManifest(m).some(e=>e.includes('视频动作')));
 }
});
