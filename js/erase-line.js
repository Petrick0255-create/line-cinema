const distanceTo=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
// Remove the selected straight run only, stopping at a turn or a junction.
// The raster source remains unchanged and the caller keeps an undo copy.
export function eraseContourAt(trace,point,radius){
  let best=null;
  trace.paths.forEach((path,p)=>{for(let i=1;i<path.length;i++){const d=distanceTo(point,path[i-1],path[i]);if(d<=radius&&(!best||d<best.d))best={p,i,d};}});
  if(!best)return null;
  const path=trace.paths[best.p],a=path[best.i-1],b=path[best.i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1;
  const aligned=(u,v)=>{const x=v[0]-u[0],y=v[1]-u[1],n=Math.hypot(x,y)||1;return(dx*x+dy*y)/(length*n)>.97&&[u,v].every(p=>Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/length<1.3);};
  let from=best.i-1,to=best.i;
  while(from>0&&aligned(path[from-1],path[from]))from--;
  while(to<path.length-1&&aligned(path[to],path[to+1]))to++;
  const pieces=[path.slice(0,from+1),path.slice(to)].filter(p=>p.length>1),paths=trace.paths.flatMap((p,i)=>i===best.p?pieces:[p]);
  if(!paths.length)throw new Error('마지막 남은 선은 지울 수 없습니다.');
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of paths)for(const[x,y]of p){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  return{...trace,paths,bounds:{x:x0,y:y0,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0)}};
}
