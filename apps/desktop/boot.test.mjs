import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStageRunner,withTimeout,bootSnapshot} from './boot.mjs';
test('stage failures retain original stack and independent stages continue',async()=>{
 const updates=[],logs=[],error=Error('broken character');
 const run=createStageRunner(s=>updates.push(s),s=>logs.push(s));
 assert.equal((await run('characters','builtin',()=>{throw error;})).ok,false);
 assert.equal((await run('hub','service',()=>42)).value,42);
 await run('characters','user scan',()=>{});
 const final=updates.at(-1);assert.equal(final[0].status,'failed');assert.equal(final[0].label,'builtin');assert.match(final[0].error,/broken character/);assert.equal(final[1].status,'success');
 assert.ok(logs.some(s=>s.includes(error.stack)));
 assert.equal(updates[0][0].status,'running');
});
test('timeout identifies stuck step and clears successful timers',async()=>{
 await assert.rejects(withTimeout(()=>new Promise(()=>{}),'loadCharacter',10),/loadCharacter: timeout after 0.01s/);
 assert.equal(await withTimeout(()=>7,'startHub',20000),7);
 await assert.rejects(withTimeout(()=>{throw Error('original');},'startHub'),/original/);
});
test('runner applies timeout and continues after rejection',async()=>{
 const stages=[];const run=createStageRunner(s=>stages.push(s),()=>{});
 assert.equal((await run('hub','startHub',()=>Promise.reject(Error('offline')),{timeout:true})).ok,false);
 assert.equal((await run('pet','tray',()=>true)).ok,true);
 assert.equal(stages.at(-1)[0].status,'failed');
});
test('boot snapshot has the collections used by control while no hub or character exists',()=>{
 const settings={onboarded:false};const s=bootSnapshot(settings);
 assert.equal(s.booting,true);assert.equal(s.settings,settings);
 assert.deepEqual(s.sessions,[]);assert.deepEqual(s.characters,[]);assert.deepEqual(s.log,[]);
 for(const source of ['claude-code','codex'])assert.equal(s.tools[source].installed,false);
 assert.equal(s.character,null);assert.equal(s.port,null);
 assert.deepEqual(bootSnapshot(settings,[{manifest:{id:'x',name:'X'}}]).characters,[{id:'x',name:'X'}]);
});
import {createBootLogger} from './boot-log.mjs';
test('boot logger writes entry first, falls back and records uncaught failures',()=>{
 const writes=[],handlers={},dialogs=[];
 const runtime={execPath:'/exe/PetLink.exe',platform:'win32',on:(name,fn)=>{handlers[name]=fn;}};
 const log=createBootLogger({getVersion:()=> '0.1.0',getPath:()=>'/userdata'},{showErrorBox:(...args)=>dialogs.push(args)},{runtime,ensureDir:()=>{},append:(file,line)=>{if(path.dirname(file)===path.normalize('/exe'))throw Error('read only');writes.push({file,line});}});
 assert.equal(writes[0].file,path.join('/userdata','boot.log'));
 assert.match(writes[0].line,/^\S+ \[boot\] entry platform=win32 version=0.1.0/);
 assert.ok(writes[0].line.includes('log path: '+path.join('/userdata','boot.log')));
 log('stage');handlers.unhandledRejection(Error('async failure'));handlers.uncaughtException(Error('sync failure'));
 assert.equal(dialogs.length,2);assert.match(writes.at(-1).line,/sync failure/);
});
test('boot logger survives both unwritable paths and unavailable error dialog',()=>{
 const handlers={};const log=createBootLogger({getVersion:()=> 'test',getPath:()=>{throw Error('no path');}},{showErrorBox:()=>{throw Error('no dialog');}},{ensureDir:()=>{},runtime:{execPath:'/exe/PetLink.exe',platform:'win32',on:(name,fn)=>{handlers[name]=fn;}},append:()=>{throw Error('unwritable');}});
 assert.doesNotThrow(()=>{log('still alive');handlers.uncaughtException(Error('failure'));});
});
test('production stage timeout is exactly 20 seconds and marks failure',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const updates=[],logs=[];const run=createStageRunner(s=>updates.push(s),s=>logs.push(s));
 const result=run('hub','startHub',()=>new Promise(()=>{}),{timeout:true});
 t.mock.timers.tick(19999);assert.equal(updates.at(-1)[0].status,'running');
 t.mock.timers.tick(1);assert.equal((await result).ok,false);
 assert.equal(updates.at(-1)[0].status,'failed');assert.match(logs.at(-1),/startHub: timeout after 20s/);
});

import {canCreatePet,finishBoot} from './boot.mjs';
import {petData} from './pet-data.mjs';
test('placeholder and incomplete snapshots are safe for pet rendering',()=>{
 const s=bootSnapshot({});assert.deepEqual(s.aggregate,{state:'idle',quiet:false});
 for(const input of [s,null,{}, {aggregate:{},sessions:null,character:{}}]){
  const data=petData(input);assert.ok(Array.isArray(data.sessions));
  assert.equal(data.aggregate.state,'idle');assert.equal(data.aggregate.quiet,false);
  assert.ok(data.character.manifest.states.idle[0].frames.length);
  assert.equal(typeof data.character.base,'string');assert.ok(data.character.manifest.anchor);
 }
});
test('boot completion always loads control before sending failure report',async()=>{
 for(const report of [[],[{label:'加载用户角色 broken',status:'failed',error:'original error'}]]){
  const calls=[];await finishBoot({loadFile:async file=>calls.push(file),webContents:{send:(...args)=>calls.push(args)}},report);
  assert.deepEqual(calls,['control.html',['boot-report',report]]);
 }
});
test('pet requires builtin, hub and data directory independently',()=>{
 for(let mask=0;mask<8;mask++)assert.equal(canCreatePet({ok:!!(mask&1)},{ok:!!(mask&2)},{ok:!!(mask&4)}),mask===7);
});
