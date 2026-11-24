const fallbackCharacter={base:new URL('../../characters/xiaodada/',import.meta.url).href,manifest:{anchor:{x:.5,y:1},scale:1,states:{idle:[{frames:['frames/idle/idle/frame_000.webp'],fps:1,loop:true}]}}};
export function petData(s){
 const character=s?.character;
 return {...s,aggregate:{state:s?.aggregate?.state||'idle',quiet:!!s?.aggregate?.quiet},sessions:Array.isArray(s?.sessions)?s.sessions:[],character:character?.manifest?.states?.idle?.[0]?.frames?.length?{...character,manifest:{...character.manifest,anchor:character.manifest.anchor||{x:.5,y:1},scale:character.manifest.scale||1}}:fallbackCharacter};
}
