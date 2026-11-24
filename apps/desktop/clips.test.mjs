import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {validateManifest} from './character.mjs';
const base=JSON.parse(await readFile(new URL('../../characters/xiaodada/manifest.json',import.meta.url)));
test('legacy and clips manifest safety',()=>{assert.deepEqual(validateManifest(base),[]);const legacy=structuredClone(base);delete legacy.clips;for(const actions of Object.values(legacy.states))for(const a of actions)delete a.clip;assert.deepEqual(validateManifest(legacy),[]);for(const file of ['../x.webm','/tmp/a.webm','a/../../x.webm','a\\x.webm','file:///x.webm','a/%2e%2e/x.webm']){const m=structuredClone(base);(m.clips??={}).bad={file,durationMs:5000,fallbackFrames:['a/static.webp']};assert.ok(validateManifest(m).length,file);}const m=structuredClone(base);(m.clips??={}).bad={file:'a/motion.webm',durationMs:5,fallbackFrames:['../a.webp']};assert.ok(validateManifest(m).length);});

test('all registered M6 media exist; completed states contain distinct real frames',async()=>{
 const {createHash}=await import('node:crypto');
 assert.equal(Object.keys(base.clips).length,15);assert.equal(base.emotions.length,8);
 for(const clip of Object.values(base.clips))for(const file of [clip.file,...clip.fallbackFrames])assert.ok((await readFile(new URL('../../characters/xiaodada/'+file,import.meta.url))).length);
 for(const e of base.emotions)assert.ok((await readFile(new URL('../../characters/xiaodada/'+e.file,import.meta.url))).length);
 for(const state of ['waiting','error','offline']){
  const action=base.states[state][0],frames=action.frames;assert.ok(action.clip||frames.length>=24);if(action.clip){assert.equal(action.fps,60);assert.ok(base.clips[action.clip]);}
  const hashes=await Promise.all(frames.map(async file=>createHash('sha256').update(await readFile(new URL('../../characters/xiaodada/'+file,import.meta.url))).digest('hex')));
  assert.equal(new Set(hashes).size,frames.length);
 }
 const m=structuredClone(base);m.states.extra=[{name:'escape',fps:24,loop:false,frames:['../outside.webp']}];assert.ok(validateManifest(m).length);
});
