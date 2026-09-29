const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const pointDistance = (p,a,b) => { const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1); return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy); };

// Crossing at a point is allowed. Sharing a positive length of a line is not.
export function overlapLength(a,b,c,d) {
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<1e-8)return 0;
  if(Math.abs(dx*(c[1]-a[1])-dy*(c[0]-a[0]))/length>1e-6 || Math.abs(dx*(d[1]-a[1])-dy*(d[0]-a[0]))/length>1e-6)return 0;
  const c0=((c[0]-a[0])*dx+(c[1]-a[1])*dy)/length,d0=((d[0]-a[0])*dx+(d[1]-a[1])*dy)/length;
  return Math.max(0,Math.min(length,Math.max(c0,d0))-Math.max(0,Math.min(c0,d0)));
}

export class InkIndex {
  constructor() { this.cells=new Map();this.segments=[];this.cell=10; }
  keys(a,b,pad=0) { const out=[];for(let y=Math.floor((Math.min(a[1],b[1])-pad)/this.cell);y<=Math.floor((Math.max(a[1],b[1])+pad)/this.cell);y++)for(let x=Math.floor((Math.min(a[0],b[0])-pad)/this.cell);x<=Math.floor((Math.max(a[0],b[0])+pad)/this.cell);x++)out.push(`${x}:${y}`);return out; }
  add(a,b) { if(distance(a,b)<1e-8)return;const id=this.segments.length;this.segments.push([a,b]);for(const key of this.keys(a,b)){if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(id);} }
  addPath(points) { for(let i=1;i<points.length;i++)this.add(points[i-1],points[i]); }
  query(a,b,pad=0) { const ids=new Set();for(const key of this.keys(a,b,pad))for(const id of this.cells.get(key)||[])ids.add(id);return ids; }
  overlaps(a,b) { for(const id of this.query(a,b)) { const [c,d]=this.segments[id];if(overlapLength(a,b,c,d)>1e-5)return true; }return false; }
  clearance(p,radius=2) { let result=radius;for(const id of this.query(p,p,radius)){const[a,b]=this.segments[id];result=Math.min(result,pointDistance(p,a,b));}return result; }
}

export function samplePath(points,spacing=2.5) {
  const out=[points[0]];
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(distance(a,b)/spacing));for(let j=1;j<=steps;j++){const f=j/steps;out.push(j===steps?b:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);}}
  return out;
}

// New connectors occupy new geometry. A short bowed connection is used when
// a straight connection would run along an existing stroke. Intersections are
// permitted, but no connector may share a segment with any existing edge.
export function makeConnector(a,b,ink,width,height) {
  const d=distance(a,b),nx=-(b[1]-a[1])/(d||1),ny=(b[0]-a[0])/(d||1),base=Math.max(2.8,Math.min(8,d*.18));
  let best=null,bestScore=Infinity;
  const offsets=[0,base,-base,base*1.7,-base*1.7,base*2.6,-base*2.6];
  for(const offset of offsets){
    const control=[clamp((a[0]+b[0])/2+nx*offset*2,0,width),clamp((a[1]+b[1])/2+ny*offset*2,0,height)],steps=Math.max(2,Math.ceil((d+Math.abs(offset)*2)/1.4)),points=[a];
    let length=0,buried=0,invalid=false;
    for(let j=1;j<=steps;j++){const t=j/steps,u=1-t,p=j===steps?b:[u*u*a[0]+2*u*t*control[0]+t*t*b[0],u*u*a[1]+2*u*t*control[1]+t*t*b[1]],prev=points.at(-1),ds=distance(prev,p);if(ink.overlaps(prev,p)){invalid=true;break;}length+=ds;if(j>1&&j<steps)buried+=ds*(1-ink.clearance(p,2)/2);points.push(p);}
    if(invalid)continue;
    const score=length+buried*2.2;
    if(score<bestScore){bestScore=score;best={points,length};}
  }
  if(!best)throw new Error('겹치지 않는 연결선을 만들 수 없습니다. 선화 정리 또는 세부 묘사를 낮춰 주세요.');
  return best;
}

// Union overlapping collinear input segments before building the graph. This
// also handles saved projects containing a stroke twice or partial overlaps.
export function uniqueSegments(paths) {
  const groups=new Map();
  for(const path of paths)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],d=distance(a,b);if(d<1e-7)continue;
    let ux=(b[0]-a[0])/d,uy=(b[1]-a[1])/d;if(ux< -1e-8||Math.abs(ux)<1e-8&&uy<0){ux=-ux;uy=-uy;}
    const nx=-uy,ny=ux,c=a[0]*nx+a[1]*ny,key=[Math.round(ux*1e7),Math.round(uy*1e7),Math.round(c*1e5)].join(':');
    if(!groups.has(key))groups.set(key,{ux,uy,nx,ny,c,events:[]});
    const g=groups.get(key),ta=a[0]*g.ux+a[1]*g.uy,tb=b[0]*g.ux+b[1]*g.uy;g.events.push([Math.min(ta,tb),1],[Math.max(ta,tb),-1]);
  }
  const out=[];
  for(const g of groups.values()){
    g.events.sort((a,b)=>a[0]-b[0]);let count=0,last=null;
    for(let i=0;i<g.events.length;){const at=g.events[i][0];if(count>0&&last!==null&&at-last>1e-7)out.push([[g.ux*last+g.nx*g.c,g.uy*last+g.ny*g.c],[g.ux*at+g.nx*g.c,g.uy*at+g.ny*g.c]]);let delta=0;while(i<g.events.length&&Math.abs(g.events[i][0]-at)<1e-7)delta+=g.events[i++][1];count+=delta;last=at;}
  }
  return out;
}

// Thinning a thick raster junction often leaves several 1-pixel T junctions.
// Treat each tiny cluster as one junction, rather than adding visible little
// loops around all of those raster artifacts. Cluster diameter is bounded;
// it cannot grow along a contour and erase a meaningful section of the image.
export function cleanJunctions(segments) {
  const points=[],edges=[],adj=[],map=new Map();
  const vertex=p=>{const key=p.map(n=>Math.round(n*1e4)).join(':');if(map.has(key))return map.get(key);const id=points.length;points.push(p);adj.push([]);map.set(key,id);return id;};
  for(const[a,b]of segments){const u=vertex(a),v=vertex(b);if(u!==v){const id=edges.length;edges.push({a:u,b:v,length:distance(a,b)});adj[u].push(id);adj[v].push(id);}}
  const parent=points.map((_,i)=>i),boxes=points.map(p=>[...p,...p]);
  function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  const links=[];
  for(let start=0;start<points.length;start++)if(adj[start].length>=3)for(const first of adj[start]){
    let at=start,id=first,length=0;const nodes=[start];
    while(true){const e=edges[id];length+=e.length;if(length>3.01)break;at=e.a===at?e.b:e.a;nodes.push(at);if(adj[at].length!==2){if(adj[at].length>=3&&at>start)links.push({nodes,length});break;}id=adj[at][0]===id?adj[at][1]:adj[at][0];}
  }
  links.sort((a,b)=>a.length-b.length);let merged=0;
  for(const{nodes}of links){const roots=[...new Set(nodes.map(find))];if(roots.length<2)continue;const box=[Infinity,Infinity,-Infinity,-Infinity];for(const r of roots){box[0]=Math.min(box[0],boxes[r][0]);box[1]=Math.min(box[1],boxes[r][1]);box[2]=Math.max(box[2],boxes[r][2]);box[3]=Math.max(box[3],boxes[r][3]);}if(Math.max(box[2]-box[0],box[3]-box[1])>3.01)continue;for(const r of roots.slice(1)){parent[r]=roots[0];merged++;}boxes[roots[0]]=box;}
  const centers=new Map();for(let i=0;i<points.length;i++){const r=find(i);if(!centers.has(r))centers.set(r,[0,0,0]);const c=centers.get(r);c[0]+=points[i][0];c[1]+=points[i][1];c[2]++;}
  for(const c of centers.values()){c[0]/=c[2];c[1]/=c[2];c.length=2;}
  const kept=[],unique=new Set(),neighbors=new Map();
  for(const e of edges){const a=find(e.a),b=find(e.b);if(a===b)continue;const key=a<b?`${a}:${b}`:`${b}:${a}`;if(unique.has(key))continue;unique.add(key);const id=kept.length;kept.push({a,b,length:distance(centers.get(a),centers.get(b))});for(const v of[a,b]){if(!neighbors.has(v))neighbors.set(v,[]);neighbors.get(v).push(id);}}
  const removed=new Set();let prunedLength=0;
  for(const[start,list]of neighbors)if(list.length===1){let at=start,id=list[0],length=0;const chain=[];while(true){const e=kept[id];length+=e.length;chain.push(id);if(length>2.5)break;at=e.a===at?e.b:e.a;const next=neighbors.get(at);if(next.length!==2){if(next.length>=3)for(const j of chain)if(!removed.has(j)){removed.add(j);prunedLength+=kept[j].length;}break;}id=next[0]===id?next[1]:next[0];}}
  return {segments:kept.filter((_,i)=>!removed.has(i)).map(e=>[centers.get(e.a),centers.get(e.b)]),merged,prunedLength};
}
