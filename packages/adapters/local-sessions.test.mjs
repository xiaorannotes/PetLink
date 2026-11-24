import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {lifecycle,startLocalSessions} from './local-sessions.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('local lifecycle ignores messages and forwards no text',()=>{
 assert.equal(lifecycle(JSON.stringify({type:'response_item',payload:{type:'message',text:'private'}})),null);
 assert.deepEqual(lifecycle(JSON.stringify({timestamp:'2026-11-12T00:00:00Z',type:'event_msg',payload:{type:'task_started',prompt:'private'}})),{state:'working',ts:1794441600000});
});
test('tail handles partial records, real work and completion without replaying past rewards',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'petlink-tail-'));const events=[];
 const file=path.join(root,'rollout-01a1cd67-2a6f-73d1-8da5-13c8fd850f3b.jsonl');
 const row=type=>JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type}})+'\n';
 await writeFile(file,row('task_complete'));const stop=startLocalSessions({root,interval:20,accept:e=>events.push(e)});
 try{await wait(150);assert.equal(events.length,0);const start=row('task_started');await appendFile(file,start.slice(0,20));await wait(80);assert.equal(events.length,0);await appendFile(file,start.slice(20));await wait(100);assert.equal(events[0].state,'working');await appendFile(file,row('task_complete'));await wait(100);assert.equal(events.at(-1).state,'done');assert.equal(events.at(-1).session,'01a1cd67-2a6f-73d1-8da5-13c8fd850f3b');}finally{stop();await wait(30);await rm(root,{recursive:true,force:true});}
});
