import {redact} from './chat.mjs';
import {appendFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
export function createBootLogger(app,dialog,{append=appendFileSync,ensureDir=mkdirSync,runtime=process,secrets=()=>[]}={}){
 let target;
 const line=message=>`${new Date().toISOString()} ${redact(String(message),secrets())}\n`;
 const entry=`[boot] entry platform=${runtime.platform} version=${app.getVersion()}`;
 for(const location of [()=>path.join(path.dirname(runtime.execPath),'boot.log'),()=>path.join(app.getPath('userData'),'boot.log')]){
  try{const candidate=location();ensureDir(path.dirname(candidate),{recursive:true});append(candidate,line(entry)+line(`[boot] log path: ${candidate}`));target=candidate;break;}catch{}
 }
 const log=message=>{try{if(target)append(target,line(message));}catch{}};
 const fatal=error=>{const detail=error?.stack||String(error);log(`[boot] unhandled error\n${detail}`);try{dialog.showErrorBox('PetLink 启动错误',detail);}catch{}};
 runtime.on('uncaughtException',fatal);runtime.on('unhandledRejection',fatal);
 return log;
}
