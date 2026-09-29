import { continuousPath } from './continuous-path.js?v=0.3.0';
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t); return t*t*t*(t*(t*6-15)+10); };
const distance = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]);

export function makeScene(trace, settings) {
  const options = { ...settings, requestedDuration: settings.duration }, route = continuousPath(trace, options.start);
  const human = options.human / 100, b = route.bounds;
  // Spatial displacement is continuous at shared joints and crossings.
  const points = route.points.map(([x,y]) => [clamp(x + human*.15*Math.sin(x*.07+y*.035),0,trace.width), clamp(y + human*.15*Math.sin(y*.08-x*.04),0,trace.height)]);
  const lengths = [0], clock = [0]; let length = 0, weight = 0;
  for (let i=1; i<points.length; i++) {
    const d = distance(points[i-1],points[i]); let curvature = 0;
    if (i>1) { const a=points[i-2],p=points[i-1],q=points[i]; curvature=1-clamp(((p[0]-a[0])*(q[0]-p[0])+(p[1]-a[1])*(q[1]-p[1]))/(distance(a,p)*d||1),-1,1); }
    length += d;
    weight += d * (1 + human*(curvature*.65 + .12*(1+Math.sin(length*.045))));
    lengths.push(length); clock.push(weight);
  }
  // Limit travel per output frame, rather than introducing a pause per piece.
  const maxSpeed = Math.max(12,Math.max(b.w,b.h)*.4) * (options.fps||30)/30;
  options.duration = Math.max(options.duration, Math.ceil(weight/maxSpeed));
  const ws = points.map(([x,y]) => options.width * mix(1,.7+.18*Math.sin(x*.037+y*.029)+.1*Math.sin(x*.103-y*.071),options.pressure/100));
  // Only the very first contact tapers. Internal cache boundaries never taper.
  // Internal chunk boundaries and crossings keep the same pressure.
  const first = points[0];
  for (let i=0; i<points.length; i++) { const d=distance(first,points[i]); if(d<7) ws[i]*=mix(1,.22+.78*ease(d/7),options.pressure/100); }
  const strokes=[]; let from=0;
  function chunk(to) {
    const duration=clock[to]-clock[from], arc=lengths[to]-lengths[from];
    if(duration>0) strokes.push({points:points.slice(from,to+1),widths:ws.slice(from,to+1),lengths:lengths.slice(from,to+1).map(v=>v-lengths[from]),length:arc,times:clock.slice(from,to+1).map(v=>(v-clock[from])/duration),start:clock[from]/weight*options.duration,end:clock[to]/weight*options.duration});
    from=to;
  }
  for(let i=1;i<points.length;i++) if(lengths[i]-lengths[from]>=Math.max(20,Math.max(b.w,b.h)*.16)||i===points.length-1) chunk(i);
  // Chunks are render caches on ONE path, sharing their end/start, pressure,
  // and clock exactly. They are not separate strokes or pen-lift events.
  const scene={...trace,bounds:b,strokes,options,duration:options.duration+7,continuity:{...route.stats,length}};
  scene.cameraTrack=buildCamera(scene);return scene;
}
function activeAt(scene,t){let lo=0,hi=scene.strokes.length;while(lo<hi){const m=(lo+hi)>>1;if(scene.strokes[m].end<t)lo=m+1;else hi=m;}return Math.min(lo,scene.strokes.length-1);}
function lowerBound(a,x){let l=0,r=a.length-1;while(l<r){const m=(l+r)>>1;if(a[m]<x)l=m+1;else r=m;}return l;}
export function tipAt(scene,t){const i=activeAt(scene,t),s=scene.strokes[i];if(!s)return{x:0,y:0,drawing:false,index:0};const f=clamp((t-s.start)/(s.end-s.start));let j=lowerBound(s.times,f),a=Math.max(0,j-1),k=(f-s.times[a])/(s.times[j]-s.times[a]||1);return{x:mix(s.points[a][0],s.points[j][0],k),y:mix(s.points[a][1],s.points[j][1],k),drawing:t>=0&&t<scene.options.duration,index:i};}
function buildCamera(scene){const track=[],dt=1/30,d=scene.options.duration,b=scene.bounds;let tip=tipAt(scene,0),x=tip.x,y=tip.y;for(let t=0;t<=d+.05;t+=dt){const aim=tipAt(scene,Math.min(d,t+.25));x=mix(x,aim.x,.12);y=mix(y,aim.y,.12);track.push({x,y});} // Forward/backward filtering removes jitter without random frame-dependent motion.
for(let pass=0;pass<2;pass++){for(let i=track.length-2;i>=0;i--){track[i].x=mix(track[i].x,track[i+1].x,.55);track[i].y=mix(track[i].y,track[i+1].y,.55);}}const o=scene.options,ratio=(o.aspect||'9:16').split(':').map(Number),fit=Math.min(ratio[0]/(b.w*1.18),ratio[1]/(b.h*1.18));const required=track.map((c,i)=>{const t=Math.min(d,i/30),tip=tipAt(scene,t),p=t/d,base=o.camera==='mystery'?mix(3.6,1.85,ease(p)):mix(2,1.35,ease(p));return Math.min(base,ratio[0]*.41/(fit*(Math.abs(tip.x-c.x)+1)),ratio[1]*.41/(fit*(Math.abs(tip.y-c.y)+1)));});for(let i=0;i<track.length;i++){let zoom=required[i];for(let j=Math.max(0,i-60);j<=Math.min(track.length-1,i+60);j++)zoom=Math.min(zoom,required[j]+Math.abs(i-j)*.018);track[i].zoom=zoom;}return track;}
export function cameraAt(scene,t){const{options:o,bounds:b}=scene,center={x:b.x+b.w/2,y:b.y+b.h/2};if(o.camera==='fixed'||t>=o.duration+4)return{...center,zoom:1,rotation:0};const p=clamp(t/o.duration),i=clamp(t*30,0,scene.cameraTrack.length-1),a=scene.cameraTrack[Math.floor(i)],z=scene.cameraTrack[Math.min(Math.floor(i)+1,scene.cameraTrack.length-1)],f=i%1,zoom=o.camera==='mystery'?mix(3.6,1.85,ease(p)):mix(2,1.35,ease(p));const cam={x:mix(a.x,z.x,f),y:mix(a.y,z.y,f),zoom,rotation:o.camera==='mystery'?(Math.sin(p*Math.PI*1.4)*.022-.014):0};cam.zoom=mix(a.zoom,z.zoom,f);if(t>o.duration){const r=ease((t-o.duration)/4);cam.x=mix(cam.x,center.x,r);cam.y=mix(cam.y,center.y,r);cam.zoom=mix(cam.zoom,1,r);cam.rotation*=1-r;}return cam;}
// Local positive-winding ribbons with round joins. A whole-route outline
// would cancel ink at tight U-turns/self-intersections; local unions do not.
function partial(s,f){f=clamp(f);if(f<=0)return{points:[],widths:[]};const index=lowerBound(s.times,f),points=s.points.slice(0,index),widths=s.widths.slice(0,index);if(index===0){points.push(s.points[0]);widths.push(s.widths[0]);}else{const a=index-1,k=(f-s.times[a])/(s.times[index]-s.times[a]||1);points.push([mix(s.points[a][0],s.points[index][0],k),mix(s.points[a][1],s.points[index][1],k)]);widths.push(mix(s.widths[a],s.widths[index],k));}return{points,widths};}
function inkGeometry(s,f,move,line,arc,close){const {points,widths}=partial(s,f);for(let i=0;i<points.length;i++){const p=points[i],r=widths[i]/2;move(p[0]+r,p[1]);arc(p[0],p[1],r);close();if(!i)continue;const a=points[i-1],r0=widths[i-1]/2,d=distance(a,p);if(d<1e-9)continue;const nx=-(p[1]-a[1])/d,ny=(p[0]-a[0])/d;move(a[0]+nx*r0,a[1]+ny*r0);line(a[0]-nx*r0,a[1]-ny*r0);line(p[0]-nx*r,p[1]-ny*r);line(p[0]+nx*r,p[1]+ny*r);close();}}
export function inkPath(s,f=1){const p=new Path2D();inkGeometry(s,f,(x,y)=>p.moveTo(x,y),(x,y)=>p.lineTo(x,y),(x,y,r)=>p.arc(x,y,r,0,Math.PI*2),()=>p.closePath());return p;}
export class Renderer{
 constructor(canvas,scene,image){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.scene=scene;this.image=image;this.paths=scene.strokes.map(s=>inkPath(s,1));this.resetCache();}
 resetCache(){const s=this.scene;this.cache=document.createElement('canvas');this.cacheScale=Math.min(2,3000/Math.max(s.width,s.height));this.cache.width=Math.ceil(s.width*this.cacheScale);this.cache.height=Math.ceil(s.height*this.cacheScale);this.cacheCtx=this.cache.getContext('2d');this.cacheCtx.scale(this.cacheScale,this.cacheScale);this.cacheCtx.fillStyle='#18191d';this.cached=0;}
 render(t,view='film'){const c=this.ctx,{width:W,height:H}=this.canvas,s=this.scene,o=s.options,b=s.bounds;const final=view==='final',source=view==='source';if(final)t=s.duration;const fullCount=source?0:activeAt(s,t)+(t>=o.duration?1:0);if(fullCount<this.cached){this.cacheCtx.clearRect(0,0,s.width,s.height);this.cached=0;}while(this.cached<fullCount&&this.cached<s.strokes.length){this.cacheCtx.fill(this.paths[this.cached]);this.cached++;}c.setTransform(1,0,0,1,0,0);c.fillStyle='#fff';c.fillRect(0,0,W,H);const cam=source?{x:b.x+b.w/2,y:b.y+b.h/2,zoom:1,rotation:0}:cameraAt(s,t),scale=Math.min(W/(b.w*1.18),H/(b.h*1.18))*cam.zoom;
 c.save();c.translate(W/2,H/2);c.rotate(cam.rotation);c.scale(scale,scale);c.translate(-cam.x,-cam.y);const alpha=source?1:(o.background/100)*(1-ease((t-o.duration)/3));if(this.image&&alpha>0&&!final){c.globalAlpha=alpha;c.drawImage(this.image,0,0,s.width,s.height);c.globalAlpha=1;}if(!source){c.drawImage(this.cache,0,0,s.width,s.height);if(t<o.duration){const st=s.strokes[fullCount];if(st&&t>st.start){const p=clamp((t-st.start)/(st.end-st.start));c.fillStyle='#18191d';c.fill(inkPath(st,p));}}}c.restore();
 if(!source&&!final&&o.pen&&t<o.duration){const p=tipAt(s,t),dx=(p.x-cam.x)*scale,dy=(p.y-cam.y)*scale,x=W/2+dx*Math.cos(cam.rotation)-dy*Math.sin(cam.rotation),y=H/2+dx*Math.sin(cam.rotation)+dy*Math.cos(cam.rotation);c.save();c.translate(x,y);c.rotate(-.72);const z=W/540;c.scale(z,z);c.globalAlpha=p.drawing?.85:.32;c.beginPath();c.moveTo(0,0);c.lineTo(3,-12);c.lineTo(7,-12);c.closePath();c.fillStyle='#252630';c.fill();c.beginPath();c.moveTo(5,-11);c.lineTo(8,-37);c.lineWidth=5;c.strokeStyle='#afb1ba';c.lineCap='round';c.stroke();c.restore();}
 return{phase:t<o.duration?'되짚기 없는 한붓 드로잉':t<o.duration+4?'전체 공개':'완성 선화 · 3초',backgroundAlpha:alpha,cam};}
}
export function sceneSVG(scene){const b=scene.bounds,pad=Math.max(b.w,b.h)*.06,n=v=>v.toFixed(4);let paths='';for(const s of scene.strokes){let d='';inkGeometry(s,1,(x,y)=>{d+=`M${n(x)} ${n(y)}`;},(x,y)=>{d+=`L${n(x)} ${n(y)}`;},(x,y,r)=>{d+=`A${n(r)} ${n(r)} 0 1 1 ${n(x-r)} ${n(y)}A${n(r)} ${n(r)} 0 1 1 ${n(x+r)} ${n(y)}`;},()=>{d+='Z';});paths+=`<path d="${d}"/>`;}return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x-pad} ${b.y-pad} ${b.w+pad*2} ${b.h+pad*2}"><title>One continuous pen-down drawing</title><rect x="${b.x-pad}" y="${b.y-pad}" width="${b.w+pad*2}" height="${b.h+pad*2}" fill="white"/><g fill="#18191d">${paths}</g></svg>`;}
