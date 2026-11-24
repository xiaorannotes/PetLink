export function feedingMenu(snapshot,{feed,shop}){
 const owned=(snapshot?.catalog||[]).filter(f=>(snapshot.backpack?.[f.id]||0)>0);
 return [...(owned.length?owned.map(f=>({label:`${f.name} ×${snapshot.backpack[f.id]}`,click:()=>feed(f.id)})):[{label:'背包里还没有食物',enabled:false}]),{type:'separator'},{label:'去商店买食物…',click:shop}];
}
