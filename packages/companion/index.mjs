import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
export const RATES=Object.freeze({companionship:2,task:3,intervalMs:20*3600000,initialHunger:80,hungerPerHour:5,maxHunger:100});
export const localDay=ts=>new Date(ts).toLocaleDateString('en-CA');
const rows=[['rice','白米饭',1,35,2,'碗','bowl'],['noodles','清汤面',1,35,2,'碗','noodles'],['steamed-bun','大馒头',1,35,2,'份','handheld'],['toast','吐司',1,35,3,'份','handheld'],['sandwich','三明治',1,35,3,'份','handheld'],['chicken-bento','鸡肉便当',1,50,6,'盒','bowl'],['lanzhou-noodles','兰州拉面',1,50,6,'碗','noodles'],['fried-rice','蛋炒饭',1,50,6,'份','bowl'],['chive-pie','韭菜盒子',1,50,6,'份','handheld'],['chive-dumplings','韭菜鸡蛋水饺',1,50,6,'盘','handheld'],['deluxe-bento','豪华便当',1,50,10,'盒','bowl'],['biscuit','小饼干',3,10,1,'小份','handheld'],['milk-candy','大白兔奶糖',3,10,1,'小份','candy'],['crisps','薯片',2,15,1,'小份','handheld'],['fruit','水果拼盘',2,15,1,'小份','spoon'],['pudding','小布丁',2,15,1,'杯','spoon'],['chocolate','巧克力',2,15,1,'小份','handheld'],['ice-cream','甜筒冰激凌',1,15,2,'个','icecream'],['cheesecake','芝士蛋糕',1,15,3,'份','spoon'],['milk','牛奶',2,10,2,'盒','drink'],['juice','果汁',2,10,2,'盒','drink']];
export const FOODS=Object.freeze(rows.map(([id,name,portions,restore,price,unit,clip])=>Object.freeze({id,name,portions,restore,price,unit,clip:'eat-'+clip})));
export const foodClip=id=>FOODS.find(f=>f.id===id)?.clip||'eat-bowl';
export async function createCompanion({dataDir,now=Date.now,playClip=()=>{}}){
 await mkdir(dataDir,{recursive:true});const file=path.join(dataDir,'companion.json');let state;
 try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={balance:0,ledger:[],backpack:{},hunger:RATES.initialHunger,hungerAt:now(),lastCompanionship:null};}
 let queue=Promise.resolve();
 const snapshot=()=>{const ts=now();return {...structuredClone(state),hunger:Math.max(0,state.hunger-Math.max(0,ts-state.hungerAt)/3600000*RATES.hungerPerHour),todayCompanionship:state.ledger.some(e=>e.kind==='local-companionship'&&localDay(e.ts)===localDay(ts))?RATES.companionship:0,todayDone:state.ledger.filter(e=>e.kind==='task-reward'&&localDay(e.ts)===localDay(ts)).length,catalog:FOODS};};
 function transact(fn){const task=queue.then(async()=>{const draft=structuredClone(state);const result=fn(draft);if(!result)return {ok:false};await writeFile(file+'.tmp',JSON.stringify(draft),{mode:0o600});await rename(file+'.tmp',file);state=draft;return result;});queue=task.catch(()=>{});return task;}
 function entry(s,kind,delta,requestId,extra={}){s.balance+=delta;s.ledger.push({kind,delta,balance:s.balance,requestId,ts:now(),...extra});return {ok:true};}
 const duplicate=(s,id)=>{if(typeof id!=='string'||!id||id.length>500)throw Error('requestId 无效');return s.ledger.some(e=>e.requestId===id);};
 return {snapshot,flush:()=>queue,
 companionship:()=>transact(s=>{const ts=now();if(s.ledger.some(e=>e.kind==='local-companionship'&&localDay(e.ts)===localDay(ts))||(s.lastCompanionship!==null&&ts-s.lastCompanionship<RATES.intervalMs))return false;s.lastCompanionship=ts;return entry(s,'local-companionship',RATES.companionship,'companionship:'+localDay(ts));}),
 claimMilestone:(id,points)=>transact(s=>{const ts=now();const allowed={'keys-500':2,'keys-2000':5,'report-daily':2};const pts=allowed[id];if(!pts||pts!==points)throw Error('里程碑无效');const reqId=`milestone:${id}:${localDay(ts)}`;if(duplicate(s,reqId))return {ok:true,duplicate:true};return entry(s,'milestone',pts,reqId,{milestoneId:id});}),
 reward:event=>transact(s=>{const id=JSON.stringify(['task',event.source,event.session,event.ts]);if(duplicate(s,id))return {ok:true,duplicate:true};return entry(s,'task-reward',RATES.task,id);}),
 buy:(id,requestId)=>transact(s=>{if(duplicate(s,requestId))return {ok:true,duplicate:true};const f=FOODS.find(f=>f.id===id);if(!f)throw Error('食物不存在');if(s.balance<f.price)throw Error('积分不足');s.backpack[id]=(s.backpack[id]||0)+f.portions;return entry(s,'purchase',-f.price,requestId,{foodId:id});}),
 async feed(id,requestId){const result=await transact(s=>{if(duplicate(s,requestId))return {ok:true,duplicate:true};const f=FOODS.find(f=>f.id===id);if(!f||!(s.backpack[id]>0))throw Error('背包份数不足');const hunger=Math.max(0,s.hunger-Math.max(0,now()-s.hungerAt)/3600000*RATES.hungerPerHour);if(hunger>=RATES.maxHunger)throw Error('已经吃饱啦');s.backpack[id]--;s.hunger=Math.min(RATES.maxHunger,hunger+f.restore);s.hungerAt=now();return entry(s,'feeding',0,requestId,{foodId:id});});if(result.ok&&!result.duplicate)try{await playClip(foodClip(id));}catch{}return result;}
 };
}
