import {readFile,access,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {validateManifest,STATE_ACTION} from '../apps/desktop/character.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(root,'characters/xiaodada');const m=JSON.parse(await readFile(path.join(base,'manifest.json')));
assert.deepEqual(validateManifest(m),[]);let frames=new Set();
for(const [state,name]of Object.entries(STATE_ACTION)){assert.equal(m.states[state][0].name,name);for(const a of m.states[state])for(const f of a.frames){assert.ok((await realpath(path.join(base,f))).startsWith(base+path.sep));frames.add(f);}}
for(const clip of Object.values(m.clips||{}))for(const f of [clip.file,...clip.fallbackFrames])assert.ok((await realpath(path.join(base,f))).startsWith(base+path.sep));
for(const e of m.emotions||[])await access(path.join(base,e.file));
for(const f of ['main.mjs','preload.cjs','pet.html','pet.mjs','control.html','control.mjs','control.css'])await access(path.join(root,'apps/desktop',f));
const html=await readFile(path.join(root,'apps/desktop/control.html'),'utf8');for(const id of ['connections','companion','actions','pets','notifications','diagnostics'])assert.ok(html.includes(`id="${id}"`));
for(const bg of ['transparent','dark','light'])await access(path.join(root,'docs/m4-previews',bg+'.png'));
console.log(`桌面无头自检通过：${frames.size} 个逐帧文件、9 个动作映射、六页资源、三背景预览。此检查不代表 Electron 实机截图验收。`);
