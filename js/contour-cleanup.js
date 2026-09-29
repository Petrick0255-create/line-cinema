// Remove small details before connecting contours into one stroke. Work on
// whole graph chains, not individual segments: a short link between two
// junctions can be essential to a long silhouette and must survive.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function cleanContours(segments,strength,width,height){
  strength=Math.max(0,Math.min(100,Number(strength)||0));
  if(!strength)return{segments,removedLength:0,removedComponents:0,removedDetails:0};
  const scale=Math.max(width,height)/1100,leafLimit=(3+strength*.34)*scale,componentLimit=(6+strength*.7)*scale;
  const points=[],adj=[],edges=[],byPoint=new Map();
  const vertex=p=>{const key=p.map(v=>Math.round(v*1e4)).join(':');if(byPoint.has(key))return byPoint.get(key);const id=points.length;points.push(p);adj.push([]);byPoint.set(key,id);return id;};
  for(const[a,b]of segments){const u=vertex(a),v=vertex(b);if(u===v)continue;const id=edges.length;edges.push({a:u,b:v,length:distance(a,b)});adj[u].push(id);adj[v].push(id);}
  const other=(id,v)=>edges[id].a===v?edges[id].b:edges[id].a;
  const seen=new Set(),components=[];
  for(let start=0;start<points.length;start++)if(!seen.has(start)){
    const stack=[start],ids=new Set(),box=[Infinity,Infinity,-Infinity,-Infinity];seen.add(start);
    while(stack.length){const v=stack.pop(),p=points[v];box[0]=Math.min(box[0],p[0]);box[1]=Math.min(box[1],p[1]);box[2]=Math.max(box[2],p[0]);box[3]=Math.max(box[3],p[1]);for(const id of adj[v]){ids.add(id);const next=other(id,v);if(!seen.has(next)){seen.add(next);stack.push(next);}}}
    components.push({ids:[...ids],length:[...ids].reduce((n,id)=>n+edges[id].length,0),span:Math.max(box[2]-box[0],box[3]-box[1])});
  }
  const removed=new Set();let removedComponents=0,removedDetails=0;
  // Always preserve the largest component, even for a very small drawing.
  const largest=components.reduce((best,c)=>!best||c.length>best.length?c:best,null);
  for(const c of components)if(c!==largest&&c.length<componentLimit*2&&c.span<componentLimit){for(const id of c.ids)removed.add(id);removedComponents++;}
  const visited=new Set();
  for(let start=0;start<points.length;start++)if(adj[start].length!==2)for(const first of adj[start]){
    if(visited.has(first)||removed.has(first))continue;
    const chain=[];let at=start,id=first,length=0;
    while(true){visited.add(id);chain.push(id);length+=edges[id].length;at=other(id,at);if(at===start||adj[at].length!==2)break;id=adj[at][0]===id?adj[at][1]:adj[at][0];}
    const leaf=(adj[start].length===1&&adj[at].length>=3)||(adj[at].length===1&&adj[start].length>=3);
    const tinyLoop=at===start&&length<leafLimit*2.4;
    if((leaf&&length<leafLimit)||tinyLoop){for(const j of chain)removed.add(j);removedDetails++;}
  }
  return{segments:edges.filter((_,id)=>!removed.has(id)).map(e=>[points[e.a],points[e.b]]),removedLength:[...removed].reduce((n,id)=>n+edges[id].length,0),removedComponents,removedDetails};
}
