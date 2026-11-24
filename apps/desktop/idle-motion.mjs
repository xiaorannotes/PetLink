// Continuous plush deformation. New poses are rendered at display refresh rate;
// this is not a 24 fps sequence relabelled as 60 fps.
export function createIdleMotion(img){
 try{return createRig(img);}catch(error){
  document.querySelector('#idle-motion')?.remove();
  console.warn('待机动态渲染不可用，显示角色底图',error.message);
  return {draw:()=>false,hide:()=>{img.style.opacity='';}};
 }
}
function createRig(img){
 const canvas=document.createElement('canvas');canvas.id='idle-motion';
 Object.assign(canvas.style,{position:'absolute',pointerEvents:'none',display:'none'});
 img.before(canvas);
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
 if(!gl)return {draw:()=>false,hide:()=>{}};
 const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();
 gl.attachShader(program,compile(gl.VERTEX_SHADER,`
 precision mediump float;attribute vec2 point;varying vec2 uv;uniform float time;uniform vec2 fit;uniform vec2 anchor;uniform mediump vec2 gaze;uniform mediump float sleeping;
 void main(){
  uv=point;
  float phase=time*6.28318530718/8.0;
  float breath=(1.0-cos(phase*2.0))*0.5;
  float planted=smoothstep(0.07,0.40,point.y);
  float head=smoothstep(0.43,0.65,point.y)*(1.0-sleeping);
  float tilt=gaze.x*0.045*head;
  vec2 p=point-vec2(0.5,0.43);
  p=mat2(cos(tilt),sin(tilt),-sin(tilt),cos(tilt))*p;
  p+=vec2(0.5,0.43);
  p.x+=gaze.x*0.016*head; p.y+=gaze.y*0.012*head;
  p.x+=(point.x-0.5)*breath*0.009*planted*(1.0-head);
  p.y+=breath*0.006*planted;
  // Subtle shoulder settling, with the shoes and floor contact kept stationary.
  p.y+=sin(phase*2.0)*0.0015*planted*(1.0-head);
  p=(p-vec2(0.5))*fit+vec2(0.5)+(vec2(1.0)-fit)*(anchor-vec2(0.5));
  gl_Position=vec4(p*2.0-1.0,0.0,1.0);
 }`));
 gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 uv;uniform sampler2D picture;void main(){gl_FragColor=texture2D(picture,uv);}`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const points=[],n=40;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const l=x/n,r=(x+1)/n,b=y/n,t=(y+1)/n;points.push(l,b,r,b,l,t,l,t,r,b,r,t);}
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
 const location=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
 const time=gl.getUniformLocation(program,'time'),fit=gl.getUniformLocation(program,'fit'),anchor=gl.getUniformLocation(program,'anchor');
 const gaze=gl.getUniformLocation(program,'gaze'),sleeping=gl.getUniformLocation(program,'sleeping');
 let target={x:0,y:0},smooth={x:0,y:0},lastTime=0;
 let source='',ready=false,generation=0;
 return {
  look(point){target={x:point.x/5,y:-point.y/5};},
  draw(url,elapsed,manifest,options={}){
   if(gl.isContextLost()){this.hide();return false;}
   if(url!==source){source=url;ready=false;const ticket=++generation;const asset=new Image();asset.onload=()=>{if(ticket!==generation)return;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,asset);canvas.assetWidth=asset.naturalWidth;canvas.assetHeight=asset.naturalHeight;ready=true;};asset.src=url;}
   if(!ready){this.hide();return false;}
   const width=img.clientWidth,height=img.clientHeight,dpr=devicePixelRatio;
   const w=Math.round(width*dpr),h=Math.round(height*dpr);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
   Object.assign(canvas.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:width+'px',height:height+'px',display:'block',transform:img.style.transform,transformOrigin:img.style.transformOrigin,translate:img.style.translate,rotate:img.style.rotate,transition:img.style.transition});
   const ratio=Math.min(width/canvas.assetWidth,height/canvas.assetHeight);
   gl.uniform2f(fit,canvas.assetWidth*ratio/width,canvas.assetHeight*ratio/height);
   gl.uniform2f(anchor,manifest.anchor.x,1-manifest.anchor.y);
   const stamp=performance.now(),dt=Math.min(64,stamp-lastTime||16);lastTime=stamp;const ease=1-Math.exp(-dt/140);smooth.x+=(target.x-smooth.x)*ease;smooth.y+=(target.y-smooth.y)*ease;
   const isSleep=options.pose==='sleep';
   gl.uniform2f(gaze,isSleep?0:smooth.x,isSleep?0:smooth.y);gl.uniform1f(sleeping,isSleep?1:0);

   gl.uniform1f(time,elapsed/1000);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,points.length/2);
   img.style.opacity='0';return true;
  },
  hide(){canvas.style.display='none';img.style.opacity='';}
 };
}
