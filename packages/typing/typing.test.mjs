import {tmpdir} from 'node:os';import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {createCounter} from './counter.mjs';
import {startHub,SessionStore} from '../hub/index.mjs';
import {SOURCES,validateEvent} from '../protocol/index.mjs';
const event=(count,ts=1000)=>({v:1,source:'typing',session:'helper',state:count?'working':'idle',count,ts});
test('typing counts every callback without inspecting or retaining event values',()=>{const c=createCounter();const poison=new Proxy({},{get(){throw Error('must never read content');}});c.increment(poison);c.increment(poison);assert.equal(c.take(),2);assert.equal(c.take(),0);});
test('typing is registered, count-only events are strictly validated',()=>{assert.ok(SOURCES.includes('typing'));assert.equal(validateEvent(event(2)).ok,true);for(const patch of [{count:-1},{count:1.5},{title:'content'},{project:'window'},{beat:true},{state:'done'}])assert.equal(validateEvent({...event(2),...patch}).ok,false);});
test('typing aggregates count, heartbeat, priority, expiry and local-day rollover',()=>{let now=1000;const s=new SessionStore({now:()=>now});s.accept(event(5));s.accept(event(3));assert.equal(s.snapshot().typing.today,8);assert.equal(s.aggregate().state,'working');s.accept({v:1,source:'generic',session:'real',state:'waiting',ts:now});assert.equal(s.aggregate().state,'waiting');now+=10001;assert.equal(s.snapshot().typing.connected,true);now+=5000;assert.equal(s.snapshot().typing.connected,false);now+=86400000;assert.equal(s.snapshot().typing.today,0);});
test('typing owned source has no content access, file writes or logging paths',async()=>{const code=await readFile(new URL('./main.mjs',import.meta.url),'utf8');assert.match(code,/on\('keydown',counter.increment\)/);assert.doesNotMatch(code,/keycode|keyCode|rawcode|windowTitle|activeWindow|writeFile|appendFile|console\.|boot.log|JSON.stringify\(.*event/);assert.match(code,/,5000\)/);});

test('typing totals persist across Hub restarts, connection does not',async()=>{const dataDir=await mkdtemp(path.join(tmpdir(),'typing-'));let hub;try{hub=await startHub({dataDir,port:0});hub.store.accept(event(19));await hub.close();hub=await startHub({dataDir,port:0});assert.deepEqual(hub.store.snapshot().typing,{today:19,connected:false});}finally{await hub?.close();await rm(dataDir,{recursive:true});}});
