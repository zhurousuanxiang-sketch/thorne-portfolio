/* Lunar color mosaic: NASA's Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720/ */
(()=>{'use strict';
const canvas=document.getElementById('moon-canvas'),hero=document.querySelector('.hero');
if(!canvas||!hero)return;
const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true,powerPreference:'low-power'});
if(!gl)return;
const vertex=`attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.0,1.0);}`;
const fragment=`
precision highp float;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform sampler2D uTexture;
uniform sampler2D uHeight;
const float PI=3.14159265;
vec2 sphereUV(vec3 n){float tilt=-0.13;vec3 q=vec3(cos(tilt)*n.x-sin(tilt)*n.y,sin(tilt)*n.x+cos(tilt)*n.y,n.z);float a=uTime*0.069813-0.22;float c=cos(a),s=sin(a);vec3 p=vec3(c*q.x+s*q.z,q.y,-s*q.x+c*q.z);return vec2(fract(atan(p.x,p.z)/(2.0*PI)+0.5),acos(clamp(p.y,-1.0,1.0))/PI);}
float heightAt(vec2 uv){return dot(texture2D(uHeight,uv).rgb,vec3(0.299,0.587,0.114));}
void main(){
  vec2 p=(gl_FragCoord.xy/uResolution-0.5)*2.0;
  p.x*=uResolution.x/uResolution.y;
  float radius=0.635,d=length(p),sphereZ=0.0;
  vec3 color=vec3(0.0);float alpha=0.0;
  if(d<radius){
    sphereZ=sqrt(max(radius*radius-dot(p,p),0.0));
    vec3 n=normalize(vec3(p,sphereZ));vec2 uv=sphereUV(n);
    vec3 moon=texture2D(uTexture,uv).rgb;
    vec3 tangent=normalize(vec3(n.z,0.001,-n.x)),bitangent=normalize(cross(n,tangent));
    float dx=heightAt(uv+vec2(0.001,0.0))-heightAt(uv-vec2(0.001,0.0));
    float dy=heightAt(uv+vec2(0.0,0.002))-heightAt(uv-vec2(0.0,0.002));
    vec3 relief=normalize(n-tangent*dx*2.0-bitangent*dy*2.0);
    vec3 light=normalize(vec3(-0.35+uPointer.x*0.12,0.55+uPointer.y*0.10,1.4));
    float diffuse=max(dot(relief,light),0.0),fresnel=pow(1.0-n.z,3.0);
    float luminance=dot(moon,vec3(0.299,0.587,0.114));
    float surface=clamp((luminance-0.4)*1.5+0.24,0.25,0.97);
    vec3 silver=vec3(0.96,0.985,1.03)*surface;
    color=silver*(0.28+diffuse*1.04);
    color+=vec3(0.32,0.46,0.67)*fresnel*0.20;
    color=color/(vec3(1.0)+color*0.25);
    alpha=1.0-smoothstep(radius-0.0025,radius,d);
  }else{
    float halo=(exp(-(d-radius)*48.0)*0.31+exp(-(d-radius)*11.0)*0.045)*(0.95+0.05*sin(uTime*0.4));
    if(halo>0.001){color=vec3(0.49,0.71,1.0);alpha=halo;}
  }
  // 极淡的外侧轨迹和三束光点；月面上保持清晰的天然地貌。
  vec3 axisA=normalize(vec3(0.97,0.12,0.0));
  vec3 axisB=normalize(vec3(-0.12,0.97,2.4));
  vec3 plane=normalize(cross(axisA,axisB));
  float orbitZ=-(plane.x*p.x+plane.y*p.y)/plane.z;
  float orbitDistance=abs(length(vec3(p,orbitZ))-0.88);
  float outside=smoothstep(radius+0.035,radius+0.12,d);
  float orbitLine=exp(-orbitDistance*205.0)*0.085*outside;
  vec3 orbitColor=vec3(0.55,0.79,1.0);
  color+=orbitColor*orbitLine;alpha=max(alpha,orbitLine);
  for(int i=0;i<3;i++){
    float angle=uTime*0.20+float(i)*2.094395;
    vec3 point=(axisA*cos(angle)+axisB*sin(angle))*0.88;
    if(d>=radius||point.z>=sphereZ){
      vec2 offset=p-point.xy;
      vec2 tangent=normalize((-axisA*sin(angle)+axisB*cos(angle)).xy);
      float along=dot(offset,tangent),across=dot(offset,vec2(-tangent.y,tangent.x));
      float head=exp(-dot(offset,offset)*31000.0);
      float tail=exp(-across*across*15000.0)*exp(-abs(along)*55.0)*step(along,0.0)*0.18;
      float bloom=exp(-dot(offset,offset)*2000.0)*0.20;
      float spark=clamp(head+tail+bloom,0.0,1.0);
      color=mix(color,vec3(0.79,0.9,1.0),spark);alpha=max(alpha,spark);
    }
  }
  if(alpha<0.002)discard;
  // Match the canvas compositor: low-alpha glow must not contain full-strength RGB.
  gl_FragColor=vec4(clamp(color,0.0,1.0)*alpha,alpha);
}`;
function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Moon shader unavailable');return shader;}
let program;
try{program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;}catch{return;}
gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
const resolution=gl.getUniformLocation(program,'uResolution'),time=gl.getUniformLocation(program,'uTime'),pointer=gl.getUniformLocation(program,'uPointer');
gl.uniform1i(gl.getUniformLocation(program,'uTexture'),0);gl.uniform1i(gl.getUniformLocation(program,'uHeight'),1);
let ready=false,visible=true,viewerOpen=false,enabled=!document.body.classList.contains('motion-off'),elapsed=0,lastTick=0,lastDraw=0,frame=0,lost=false;
let pointerX=0,pointerY=0,targetX=0,targetY=0;
function draw(){if(!ready||lost)return;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(resolution,canvas.width,canvas.height);gl.uniform2f(pointer,pointerX,pointerY);gl.uniform1f(time,elapsed);gl.drawArrays(gl.TRIANGLES,0,6);}
function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width)return;const size=Math.min(1200,Math.round(rect.width*Math.min(devicePixelRatio||1,1.25)));canvas.width=Math.max(1,size);canvas.height=Math.max(1,Math.round(rect.height/rect.width*size));draw();}
function stop(){if(frame)cancelAnimationFrame(frame);frame=0;lastTick=0;lastDraw=0;}
function tick(now){if(!ready||!enabled||!visible||viewerOpen||document.hidden||lost){stop();return;}if(lastTick)elapsed+=Math.min(now-lastTick,100)/1000;lastTick=now;if(now-lastDraw>=1000/30){pointerX+=(targetX-pointerX)*0.065;pointerY+=(targetY-pointerY)*0.065;draw();lastDraw=now;}frame=requestAnimationFrame(tick);}
function sync(){stop();hero.classList.toggle('moon-sleep',!enabled||!visible||viewerOpen||document.hidden||lost);if(ready&&enabled&&visible&&!viewerOpen&&!document.hidden&&!lost)frame=requestAnimationFrame(tick);else draw();}
new ResizeObserver(resize).observe(canvas);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:0}).observe(hero);
document.addEventListener('frame-motion-change',event=>{enabled=event.detail.enabled;sync();});document.addEventListener('visibilitychange',sync);
document.addEventListener('frame-viewer-change',event=>{viewerOpen=event.detail.open;sync();});
hero.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse'||!enabled)return;const r=hero.getBoundingClientRect();targetX=(event.clientX/r.width-0.5)*2;targetY=(0.5-(event.clientY-r.top)/r.height)*2;});
hero.addEventListener('pointerleave',()=>{targetX=0;targetY=0;});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;sync();hero.classList.remove('moon-ready');});
const textureImage=new Image(),backgroundImage=new Image();
textureImage.src='assets/moon-color-nasa.jpg';backgroundImage.src='assets/hero-background.png';
function upload(image){const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);}
Promise.all([textureImage.decode(),backgroundImage.decode()]).then(()=>{
  upload(textureImage);
  const stars=document.createElement('div');stars.className='lunar-stars';stars.setAttribute('aria-hidden','true');
  for(let i=0;i<22;i++){const star=document.createElement('i'),angle=i*2.399963,radius=35+((i*13)%15);star.style.left=(50+Math.cos(angle)*radius)+'%';star.style.top=(50+Math.sin(angle)*radius)+'%';star.style.setProperty('--duration',(3+(i%6))+'s');star.style.setProperty('--delay',(-i*0.37)+'s');star.style.setProperty('--size',(i%5===0?2:1)+'px');stars.append(star);}
  canvas.parentElement.prepend(stars);ready=true;resize();hero.classList.add('moon-ready');canvas.dataset.state='ready';canvas.dataset.alphaMode='premultiplied';sync();
}).catch(()=>{canvas.dataset.state='fallback';});
})();
