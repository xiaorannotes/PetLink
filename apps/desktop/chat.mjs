import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export {DEFAULT_PROMPT} from './chat-prompt.mjs';
export function validateChat(c){
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['url','apiKey','model','prompt'].includes(k))||['url','apiKey','model','prompt'].some(k=>typeof c[k]!=='string'))throw Error('聊天配置字段无效');
 if(c.url){const u=new URL(c.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/chat/completions'))throw Error('请填写 HTTP(S) /chat/completions 地址');}
 if(Object.values(c).some(v=>v.length>16000))throw Error('聊天配置过长');return c;
}
export function redact(value,secrets=[]){
 if(typeof value==='string'){let s=value;for(const key of secrets.filter(Boolean))s=s.split(key).join('***');return s.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer ***');}
 if(Array.isArray(value))return value.map(v=>redact(v,secrets));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/apikey|authorization|password/i.test(k)?'***':redact(v,secrets)]));return value;
}
export async function createChat({dataDir,config,onChange=()=>{},fetchImpl=fetch}){
 const file=path.join(dataDir,'chat-history.json');let history=[],busy=false;
 try{const rows=JSON.parse(await readFile(file,'utf8'));if(Array.isArray(rows))history=rows.filter(x=>['user','assistant','error'].includes(x.role)&&typeof x.content==='string').slice(-100);}catch(e){if(e.code!=='ENOENT')history=[];}
 const save=async()=>{history=history.slice(-100);await writeFile(file,JSON.stringify(history),{mode:0o600});};
 const snapshot=()=>({history,busy,configured:!!(config().url&&config().apiKey&&config().model)});
 return {snapshot,async clear(){if(busy)throw Error('请等待本次请求结束');history=[];await save();await onChange();},async send(content){
 if(!snapshot().configured)throw Error('请先配置模型接口');if(busy)throw Error('正在等待接口回复');if(typeof content!=='string'||!content.trim()||content.length>8000)throw Error('请输入 1–8000 字消息');
 busy=true;history.push({role:'user',content:content.trim()});
 try{await save();await onChange();const c=config();const response=await fetchImpl(c.url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+c.apiKey},body:JSON.stringify({model:c.model,messages:[{role:'system',content:c.prompt},...history.slice(0,-1).filter(x=>x.role!=='error').slice(-40),history.at(-1)]}),signal:AbortSignal.timeout(30000),redirect:'error'});if(!response.ok)throw Error('HTTP');const body=await response.json();const reply=body.choices?.[0]?.message?.content;if(typeof reply!=='string'||!reply.trim())throw Error('EMPTY');history.push({role:'assistant',content:reply});}
 catch{history.push({role:'error',content:'模型接口暂时没连通，尚未收到回复。请检查地址、密钥和网络后再试。'});}
 finally{try{await save();}finally{busy=false;await onChange(true);}}return {ok:true};
 }};
}
