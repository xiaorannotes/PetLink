import {readdir,stat,open} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';

// Read lifecycle metadata only. Chat text never leaves this reader.
export function lifecycle(line){
  let row;try{row=JSON.parse(line);}catch{return null;}
  if(row.type!=='event_msg')return null;
  const state={task_started:'working',item_completed:'working',token_count:'working',task_complete:'done',turn_aborted:'idle'}[row.payload?.type];
  return state?{state,ts:Date.parse(row.timestamp)}:null;
}
export function startLocalSessions({accept,root=path.join(homedir(),'.codex','sessions'),interval=500,now=Date.now,onError=()=>{}}){
  const files=new Map();let busy=false,stopped=false,lastScan=0;
  async function scan(dir){
    for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())await scan(file);
      else if(entry.name.endsWith('.jsonl')&&!files.has(file)){
        const s=await stat(file);if(now()-s.mtimeMs<86400000)files.set(file,{offset:Math.max(0,s.size-1048576),partial:'',initial:true,state:null});
      }
    }
  }
  async function tick(){
    if(busy||stopped)return;busy=true;
    try{
      if(now()-lastScan>2000){lastScan=now();await scan(root);}
      for(const [file,cursor] of files){
        const s=await stat(file).catch(()=>null);if(!s){files.delete(file);continue;}
        if(s.size<cursor.offset){cursor.offset=0;cursor.partial='';cursor.initial=true;}
        if(s.size>cursor.offset){
          const handle=await open(file,'r');let buffer;
          try{buffer=Buffer.alloc(Math.min(s.size-cursor.offset,2097152));const {bytesRead}=await handle.read(buffer,0,buffer.length,cursor.offset);cursor.offset+=bytesRead;buffer=buffer.subarray(0,bytesRead);}finally{await handle.close();}
          const lines=(cursor.partial+buffer.toString('utf8')).split('\n');cursor.partial=lines.pop();
          for(const line of lines){const event=lifecycle(line);if(!event||!Number.isFinite(event.ts))continue;cursor.state=event;
            if(!cursor.initial&&now()-event.ts<600000)emit(file,event);
          }
          if(cursor.initial&&cursor.state?.state==='working'&&now()-cursor.state.ts<600000)emit(file,cursor.state);
          cursor.initial=false;
        }
        if(cursor.state?.state==='working'&&now()-cursor.state.ts<600000&&now()-(cursor.lastBeat||0)>10000){emit(file,{state:'working',ts:now(),beat:true});cursor.lastBeat=now();}
      }
    }catch(e){onError(e);}finally{busy=false;}
  }
  function emit(file,event){const session=path.basename(file).match(/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.jsonl$/i)?.[1];if(session)accept({v:1,source:'codex',session,state:event.state,ts:event.ts,...(event.beat?{beat:true}:{})});}
  const timer=setInterval(()=>void tick(),interval);timer.unref?.();void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
