import { InkIndex, samplePath, makeConnector } from './pen-geometry.js?v=0.3.3';
// Staying near extracted ink is a preference with a large finite penalty.
// A necessary gap is permitted; disconnected subjects must still be drawn.
export class ContourGuide {
  constructor(points,edges,adjacent){
    this.points=points;this.edges=edges;this.adjacent=adjacent;this.ink=new InkIndex();this.cache=new Map();
    this.byPoint=new Map(points.map((p,id)=>[this.key(p),id]));
    for(const e of edges)if(!e.bridge)this.ink.addPath(e.geometry);
    this.weights=edges.map(e=>this.pathCost(e.geometry));
  }
  key(p){return p.map(n=>Math.round(n*1e4)).join(':');}
  supports(a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));for(let i=0;i<=steps;i++){const f=i/steps,p=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];if(this.ink.clearance(p,3)>2.8)return false;}return true;}
  cost(a,b){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)return 0;
    const steps=Math.max(1,Math.min(12,Math.ceil(length/4)));let penalty=0;
    for(let i=0;i<steps;i++){const f=(i+.5)/steps,p=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],gap=Math.max(0,this.ink.clearance(p,16)-2.8);penalty+=Math.min(30,gap*2.5);}
    return length*(1+penalty/steps);
  }
  pathCost(points){let cost=0;for(let i=1;i<points.length;i++)cost+=this.cost(points[i-1],points[i]);return cost;}
  linkCost(a,b){return Math.min(this.distance(a,b),this.cost(this.points[a],this.points[b]));}
  tree(start){
    if(this.cache.has(start))return this.cache.get(start);
    const distances=new Float64Array(this.points.length).fill(Infinity),previous=new Int32Array(this.points.length).fill(-1),heap=[];
    const push=(id,d)=>{let i=heap.length;heap.push([id,d]);while(i){const parent=(i-1)>>1;if(heap[parent][1]<=d)break;heap[i]=heap[parent];i=parent;}heap[i]=[id,d];};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    distances[start]=0;push(start,0);
    while(heap.length){const[v,d]=pop();if(d!==distances[v])continue;for(const id of this.adjacent[v]){const e=this.edges[id],next=e.a===v?e.b:e.a,candidate=d+this.weights[id];if(candidate<distances[next]){distances[next]=candidate;previous[next]=id;push(next,candidate);}}}
    const tree={distances,previous};this.cache.set(start,tree);if(this.cache.size>64)this.cache.delete(this.cache.keys().next().value);return tree;
  }
  distance(a,b){return this.tree(a).distances[b];}
  path(a,b){
    const from=this.byPoint.get(this.key(a)),to=this.byPoint.get(this.key(b));
    if(from===undefined||to===undefined)throw new Error('윤곽 경로의 끝점을 찾지 못했습니다.');
    const{distances,previous}=this.tree(from);if(!Number.isFinite(distances[to]))throw new Error('참고 윤곽 경로가 분리되어 있습니다.');
    const order=[];let at=to;while(at!==from){const id=previous[at],e=this.edges[id];order.push({id,to:at});at=e.a===at?e.b:e.a;}
    const path=[a];for(const item of order.reverse()){const e=this.edges[item.id],g=e.b===item.to?e.geometry:[...e.geometry].reverse();path.push(...g.slice(1));}
    return samplePath(path,1.4);
  }
}

export function supportedConnector(a,b,ink,width,height,guide){
  const center=guide.path(a,b),arc=[0];for(let i=1;i<center.length;i++)arc.push(arc[i-1]+Math.hypot(center[i][0]-center[i-1][0],center[i][1]-center[i-1][1]));
  for(const offset of[1.5,-1.5,2.2,-2.2,.9,-.9,2.6,-2.6]){
    const points=[a],ownInk=new InkIndex();let invalid=false,length=0;
    for(let i=1;i<center.length;i++){
      const p=center[i],prev=center[i-1],next=center[Math.min(center.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],d=Math.hypot(dx,dy)||1;
      const taper=Math.min(1,arc[i]/4,(arc.at(-1)-arc[i])/4),amount=offset*taper;
      const q=i===center.length-1?b:[Math.max(0,Math.min(width,p[0]-dy/d*amount)),Math.max(0,Math.min(height,p[1]+dx/d*amount))],last=points.at(-1);
      if(ink.overlaps(last,q)||ownInk.overlaps(last,q)||!guide.supports(last,q)){invalid=true;break;}
      length+=Math.hypot(q[0]-last[0],q[1]-last[1]);ownInk.add(last,q);points.push(q);
    }
    if(!invalid)return{points,length};
  }
  throw new Error('기존 윤곽 가까이에서 겹치지 않는 연결 경로를 찾지 못했습니다. 잔선 정리를 높이거나 AI 선화 정리를 사용해 주세요. 빈 공간에 직선을 추가하지 않았습니다.');
}

// Compare real candidate geometry by the same finite cost as endpoint matching.
// A contour detour is preferred when it avoids a conspicuous line through white
// space, but the drawing is never blocked merely for needing a connection.
export function optimizedConnector(a,b,ink,width,height,guide){
  const candidates=[];
  if(guide){
    try{candidates.push(makeConnector(a,b,ink,width,height,guide));}catch{}
    try{candidates.push(supportedConnector(a,b,ink,width,height,guide));}catch{}
  }
  try{candidates.push(makeConnector(a,b,ink,width,height,guide?{supports:()=>true,cost:(a,b)=>guide.cost(a,b)}:null));}catch(error){if(!candidates.length)throw error;}
  let best=null,bestCost=Infinity;for(const candidate of candidates){const cost=guide?guide.pathCost(candidate.points):candidate.length;if(cost<bestCost){best=candidate;bestCost=cost;}}
  return{...best,cost:bestCost};
}
