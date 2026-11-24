import {createCounter} from './counter.mjs';
// No event object is inspected, retained, logged or passed to the Hub.
export function startEmbeddedTyping({hook,onCount,onActivity=()=>{},setTimer=setInterval,clearTimer=clearInterval}){
 const counter=createCounter();let stopped=false;
 const flush=()=>onCount(counter.take());
 const increment=()=>{counter.increment();onActivity();};
 hook.on('keydown',increment);
 try{hook.start();}catch(error){hook.removeListener('keydown',increment);throw error;}
 flush();
 const timer=setTimer(flush,1000);timer.unref?.();
 return ()=>{if(stopped)return;stopped=true;clearTimer(timer);hook.removeListener('keydown',increment);try{hook.stop();}finally{flush();}};
}
