import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createConfigManager,EVENTS} from './codex-hooks.mjs';
test('lifecycle install preserves unrelated hooks, is idempotent and never touches notify',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'petlink-hooks-'));t.after(()=>rm(dir,{recursive:true,force:true}));const hooksPath=path.join(dir,'hooks.json');
 const existing={description:'mine',hooks:{Stop:[{hooks:[{type:'command',command:'my-existing-command'}]}]}};await writeFile(hooksPath,JSON.stringify(existing));await writeFile(path.join(dir,'config.toml'),'notify = ["existing"]\n');
 const m=createConfigManager({hooksPath,dataDir:dir,nodePath:'C:\\Program Files\\nodejs\\node.exe',adapterPath:path.join(dir,'adapter.mjs')});assert.equal((await m.enable()).ok,true);assert.equal((await m.enable()).ok,true);
 const c=JSON.parse(await readFile(hooksPath));assert.equal(c.hooks.Stop.length,2);assert.equal(c.hooks.Stop[0].hooks[0].command,'my-existing-command');assert.equal((await m.status()).events.length,EVENTS.length);assert.equal(await readFile(path.join(dir,'config.toml'),'utf8'),'notify = ["existing"]\n');
 await m.disable();assert.deepEqual(JSON.parse(await readFile(hooksPath)),existing);
});
