export function withTimeout(work,label,ms=20000){
 let timer;
 return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label}: timeout after ${ms/1000}s`)),ms);})]).finally(()=>clearTimeout(timer));
}
export function createStageRunner(report,log){
 const stages=new Map();
 return async(id,label,work,{timeout=false}={})=>{
  const emit=(status,error)=>{const previous=stages.get(id);const state={id,label,status,error: [previous?.error,error].filter(Boolean).join('\n')};if(previous?.status==='failed'){state.status='failed';state.label=error&&previous.label!==label?previous.label+'；'+label:previous.label;}stages.set(id,state);report([...stages.values()]);};
  emit('running');log(`[boot] ${label}: running`);
  try{const value=await(timeout?withTimeout(work,label):work());emit('success');log(`[boot] ${label}: success`);return {ok:true,value};}
  catch(error){const detail=error?.stack||String(error);emit('failed',detail);log(`[boot] ${label}: failed\n${detail}`);return {ok:false,error};}
 };
}
export function bootSnapshot(settings,characters=[]){return {booting:true,settings,tools:{'claude-code':{detected:false,installed:false},codex:{detected:false,installed:false}},characters:characters.map(c=>({id:c.manifest.id,name:c.manifest.name})),character:null,aggregate:{state:'idle',quiet:false},sessions:[],log:[],port:null,token:''};}

export function canCreatePet(builtIn,service,data){return builtIn.ok&&service.ok&&data.ok;}
export async function finishBoot(control,report){
 await control.loadFile('control.html');
 control.webContents.send('boot-report',report);
}
