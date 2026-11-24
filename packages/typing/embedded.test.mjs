import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {startEmbeddedTyping} from './embedded.mjs';
test('embedded hook counts without reading events and removes its listener on stop',()=>{
 const hook=new EventEmitter();let starts=0,stops=0,tick;const counts=[];
 hook.start=()=>starts++;hook.stop=()=>stops++;
 const stop=startEmbeddedTyping({hook,onCount:n=>counts.push(n),setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{}});
 const event=new Proxy({},{get(){throw Error('content must never be read');}});
 hook.emit('keydown',event);hook.emit('keydown',event);tick();hook.emit('keydown',event);stop();stop();
 assert.deepEqual(counts,[0,2,1]);assert.equal(starts,1);assert.equal(stops,1);assert.equal(hook.listenerCount('keydown'),0);
});
test('failed native startup does not leave a keyboard listener attached',()=>{
 const hook=new EventEmitter();hook.start=()=>{throw Error('native failure');};
 assert.throws(()=>startEmbeddedTyping({hook,onCount:()=>{}}),/native failure/);assert.equal(hook.listenerCount('keydown'),0);
});
test('first key immediately signals activity while counts flush once a second',()=>{
 const hook=new EventEmitter();hook.start=()=>{};hook.stop=()=>{};let active=0,interval,tick;const counts=[];
 const stop=startEmbeddedTyping({hook,onActivity:()=>active++,onCount:n=>counts.push(n),setTimer:(fn,ms)=>{tick=fn;interval=ms;return 1;},clearTimer:()=>{}});
 hook.emit('keydown',new Proxy({},{get(){throw Error('private');}}));assert.equal(active,1);assert.deepEqual(counts,[0]);assert.equal(interval,1000);tick();assert.deepEqual(counts,[0,1]);stop();
});
