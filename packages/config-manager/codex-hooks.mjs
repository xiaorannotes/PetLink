import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import path from 'node:path';import {homedir} from 'node:os';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {defaultDataDir} from '../shared/index.mjs';
export const EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd','PreModelRequest','PostModelRequest'];
const own=h=>h?.type==='command'&&h.command?.includes('--petlink-codex-hook');
export function createConfigManager({hooksPath=path.join(homedir(),'.codex/hooks.json'),dataDir=defaultDataDir(),nodePath=process.execPath,adapterPath=fileURLToPath(new URL('../adapters/codex.mjs',import.meta.url))}={}){
 async function read(){try{const value=JSON.parse(await readFile(hooksPath,'utf8'));if(!value||typeof value!=='object'||Array.isArray(value)||value.hooks&&typeof value.hooks!=='object')throw Error('hooks.json 结构无效');for(const rows of Object.values(value.hooks||{}))if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r.hooks)))throw Error('hooks.json 事件结构无效');return value;}catch(e){if(e.code==='ENOENT')return {};throw e;}}
 async function save(value){await mkdir(path.dirname(hooksPath),{recursive:true});const backup=path.join(dataDir,'backups','codex-hooks',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());await mkdir(backup,{recursive:true});try{await copyFile(hooksPath,path.join(backup,'hooks.json'));}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path.join(backup,'previously-absent'),'');}const temp=hooksPath+'.petlink-'+randomUUID();await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,hooksPath);}
 function strip(c){for(const [event,rows] of Object.entries(c.hooks||{})){c.hooks[event]=rows.flatMap(row=>{const hooks=row.hooks.filter(h=>!own(h));return hooks.length?[{...row,hooks}]:[];});if(!c.hooks[event].length)delete c.hooks[event];}return c;}
 return {
  async status(){try{const c=await read();const events=Object.entries(c.hooks||{}).filter(([,rows])=>rows.some(r=>r.hooks.some(own))).map(([k])=>k);return {ok:true,installed:events.length>0,events,requiresReview:true,kind:'lifecycle'};}catch(e){return {ok:false,installed:false,message:e.message};}},
  async enable(){try{const c=strip(await read());c.hooks??={};const command=`"${nodePath.replaceAll('\\','/')}" "${path.resolve(adapterPath).replaceAll('\\','/')}" --petlink-codex-hook`;for(const event of EVENTS)(c.hooks[event]??=[]).push({hooks:[{type:'command',command,commandWindows:command,timeout:2}]});await save(c);return {ok:true,requiresReview:true,message:'已配置，请在 Codex 设置 → Hooks 审核本地钩子'};}catch(e){return {ok:false,message:e.message};}},
  async disable(){try{await save(strip(await read()));return {ok:true};}catch(e){return {ok:false,message:e.message};}}
 };
}
