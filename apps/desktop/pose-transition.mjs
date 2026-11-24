// Retain the outgoing pose until the incoming media is decoded, then dissolve.
export function createPoseTransition(img,video){
 const layer=document.createElement('canvas');layer.id='pose-transition';
 Object.assign(layer.style,{position:'absolute',pointerEvents:'none',display:'none',zIndex:'2'});img.before(layer);
 let pending=false,animation=null;
 return {
  capture(){
   const rig=document.querySelector('#idle-motion');
   const source=!video.hidden&&video.readyState>=2?video:rig?.style.display==='block'?rig:img;
   const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;
   if(!sw||!sh)return;
   animation?.cancel();
   const w=img.clientWidth,h=img.clientHeight,dpr=devicePixelRatio;
   layer.width=Math.round(w*dpr);layer.height=Math.round(h*dpr);
   Object.assign(layer.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:w+'px',height:h+'px',display:'block',opacity:'1'});
   const ctx=layer.getContext('2d');ctx.clearRect(0,0,layer.width,layer.height);
   const ratio=source===rig?1:Math.min(w/sw,h/sh),dw=source===rig?w:sw*ratio,dh=source===rig?h:sh*ratio;
   ctx.drawImage(source,(w-dw)/2*dpr,(h-dh)*dpr,dw*dpr,dh*dpr);pending=true;
  },
  reveal(){if(!pending)return;pending=false;animation=layer.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'});animation.onfinish=()=>{layer.style.display='none';};}
 };
}
