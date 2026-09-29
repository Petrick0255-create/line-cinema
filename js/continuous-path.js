// One Euler trail: every edge is used exactly once. Odd junctions are paired
// with NEW ink connections, never with copies of already drawn edges.
import { InkIndex, makeConnector, samplePath, uniqueSegments, cleanJunctions } from './pen-geometry.js?v=0.3.2';
import { ContourGuide, supportedConnector } from './contour-guide.js?v=0.3.2';
import { cleanContours } from './contour-cleanup.js?v=0.3.2';
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cache = new WeakMap();

class UnionFind {
  constructor(n) { this.parent = Int32Array.from({ length: n }, (_, i) => i); this.size = new Uint32Array(n).fill(1); this.count = n; }
  find(i) { while (this.parent[i] !== i) { this.parent[i] = this.parent[this.parent[i]]; i = this.parent[i]; } return i; }
  join(a, b) { a = this.find(a); b = this.find(b); if (a === b) return false; if (this.size[a] < this.size[b]) [a, b] = [b, a]; this.parent[b] = a; this.size[a] += this.size[b]; this.count--; return true; }
}

function kdTree(ids, points, depth = 0) {
  if (!ids.length) return null;
  const axis = depth % 2;
  ids.sort((a, b) => points[a][axis] - points[b][axis] || a - b);
  const middle = ids.length >> 1;
  return { id: ids[middle], axis, left: kdTree(ids.slice(0, middle), points, depth + 1), right: kdTree(ids.slice(middle + 1), points, depth + 1) };
}
function labelTree(node, groups) {
  if (!node) return;
  labelTree(node.left, groups); labelTree(node.right, groups);
  const group = groups[node.id];
  node.group = (!node.left || node.left.group === group) && (!node.right || node.right.group === group) ? group : -1;
}
function nearestOutside(node, point, group, groups, points, best) {
  if (!node || node.group === group) return;
  const p = points[node.id], delta = point[node.axis] - p[node.axis];
  if (groups[node.id] !== group) {
    const d = (point[0] - p[0]) ** 2 + (point[1] - p[1]) ** 2;
    if (d < best.d) { best.d = d; best.id = node.id; }
  }
  nearestOutside(delta < 0 ? node.left : node.right, point, group, groups, points, best);
  if (delta * delta <= best.d) nearestOutside(delta < 0 ? node.right : node.left, point, group, groups, points, best);
}

function buildGraph(trace, cleanup, contourOnly) {
  const points = [], edges = [], adjacent = [], byPoint = new Map(), byEdge = new Set();
  function vertex(p) {
    const key = p.map(n => Math.round(n * 10000)).join(',');
    if (byPoint.has(key)) return byPoint.get(key);
    const id = points.length; byPoint.set(key, id); points.push(p.slice()); adjacent.push([]); return id;
  }
  const ink = new InkIndex();
  function edge(a, b, bridge = false) {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (byEdge.has(key)) return;
    byEdge.add(key); const id = edges.length;
    const geometry = bridge ? makeConnector(points[a],points[b],ink,trace.width,trace.height).points : [points[a],points[b]];
    edges.push({ a, b, length: geometry.slice(1).reduce((n,p,i)=>n+distance(geometry[i],p),0), bridge, geometry }); adjacent[a].push(id); adjacent[b].push(id);ink.addPath(geometry);
  }
  // Sampling also lets a disconnected endpoint attach close to the middle of
  // another contour, rather than drawing a long diagonal to its far endpoint.
  const cleaned=cleanJunctions(uniqueSegments(trace.paths));
  const filtered=cleanContours(cleaned.segments,cleanup,trace.width,trace.height);
  for (const path of uniqueSegments(filtered.segments)) {
    let previous = vertex(path[0]);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], steps = Math.max(1, Math.ceil(distance(a, b) / 2.5));
      for (let j = 1; j <= steps; j++) { const f = j / steps, next = vertex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); edge(previous, next); previous = next; }
    }
  }
  if (!edges.length) throw new Error('연결할 선이 없습니다. 더 선명한 그림을 사용해 주세요.');
  const union = new UnionFind(points.length);
  for (const e of edges) union.join(e.a, e.b);
  // Boruvka's minimum spanning tree: one shortest connection per component,
  // no all-to-all matrix, and no arbitrary cross-canvas pen jumps.
  const components = union.count, tree = kdTree(points.map((_, i) => i), points);
  while (union.count > 1) {
    const groups = points.map((_, i) => union.find(i)), candidates = new Map();
    labelTree(tree, groups);
    for (let a = 0; a < points.length; a++) {
      const group = groups[a], best = { id: -1, d: Infinity };
      nearestOutside(tree, points[a], group, groups, points, best);
      if (best.id >= 0 && (!candidates.has(group) || best.d < candidates.get(group).d)) candidates.set(group, { a, b: best.id, d: best.d });
    }
    for (const e of [...candidates.values()].sort((a, b) => a.d - b.d || a.a - b.a)) if (union.join(e.a, e.b)){if(contourOnly&&Math.sqrt(e.d)>5.5)throw new Error('피사체 사이의 빈 공간에는 연결선을 만들지 않습니다. 현재 선이 떨어져 있어 한붓으로 연결할 수 없습니다. 잔선 정리를 높이거나 피사체가 자연스럽게 이어지는 선화를 사용해 주세요.');edge(e.a,e.b,true);}
  }
  const bridges = edges.filter(e => e.bridge);
  return { points, edges, adjacent, guide:contourOnly?new ContourGuide(points,edges,adjacent):null, width:trace.width, height:trace.height, stats: { removedDetailLength:filtered.removedLength,removedComponents:filtered.removedComponents,removedDetails:filtered.removedDetails,simplifiedJunctions:cleaned.merged,prunedLength:cleaned.prunedLength,components, bridgeCount: bridges.length, bridgeLength: bridges.reduce((n, e) => n + e.length, 0), maxBridge: Math.max(0, ...bridges.map(e => e.length)), originalLength: edges.filter(e => !e.bridge).reduce((n, e) => n + e.length, 0) } };
}

function walk(graph, start, bounds) {
  const { points } = graph, edges=graph.edges.slice(), adjacent=graph.adjacent.map(a=>a.slice());
  const rank = p => start === 'left' ? (p[0] - bounds.x) / bounds.w : start === 'top' ? (p[1] - bounds.y) / bounds.h : 1 - (p[1] - bounds.y) / bounds.h;
  const odd = points.map((_, i) => i).filter(i => adjacent[i].length % 2);
  const candidates = odd.length ? odd : points.map((_, i) => i).filter(i => adjacent[i].length);
  const origin = candidates.reduce((a, b) => rank(points[b]) < rank(points[a]) ? b : a);
  const ink=new InkIndex();for(const e of edges)ink.addPath(e.geometry);
  let connectionLength=0,connections=0;
  const metric=(a,b)=>graph.guide?graph.guide.distance(a,b):distance(points[a],points[b]);
  if (odd.length>2) {
    const end=odd.filter(id=>id!==origin).reduce((a,b)=>rank(points[b])>rank(points[a])?b:a);
    const pending=odd.filter(id=>id!==origin&&id!==end).sort((a,b)=>rank(points[a])-rank(points[b])||a-b),pairs=[];
    while(pending.length){const a=pending.shift();let best=0;for(let i=1;i<pending.length;i++)if(metric(a,pending[i])<metric(a,pending[best]))best=i;pairs.push([a,pending.splice(best,1)[0]]);}
    // Uncross nearby pairings when doing so shortens the new ink. No graph
    // path is duplicated, even when two paired vertices are already adjacent.
    for(let pass=0;pass<2;pass++)for(let i=0;i<pairs.length;i++)for(let j=i+1;j<Math.min(pairs.length,i+80);j++){
      const[a,b]=pairs[i],[c,d]=pairs[j],old=metric(a,b)+metric(c,d),ac=metric(a,c)+metric(b,d),ad=metric(a,d)+metric(b,c);
      if(Math.min(ac,ad)<old-1e-6){pairs[i]=[a,ac<ad?c:d];pairs[j]=[b,ac<ad?d:c];}
    }
    for(const[a,b]of pairs){let path;try{path=makeConnector(points[a],points[b],ink,graph.width,graph.height,graph.guide);}catch(error){if(!graph.guide)throw error;path=supportedConnector(points[a],points[b],ink,graph.width,graph.height,graph.guide);}const id=edges.length;edges.push({a,b,length:path.length,bridge:true,geometry:path.points});adjacent[a].push(id);adjacent[b].push(id);ink.addPath(path.points);connectionLength+=path.length;connections++;}
  }
  const other = (id, at) => edges[id].a === at ? edges[id].b : edges[id].a;
  // Single-use flags are the invariant. There is no multiplicity counter,
  // duplicated-edge list, pen-up travel, or fallback to retracing.
  const used=new Uint8Array(edges.length),stack=[{at:origin,via:-1}],reversed=[];
  while(stack.length){
    const frame=stack.at(-1),at=frame.at,p=points[at],choices=adjacent[at].filter(id=>!used[id]);
    if(!choices.length){reversed.push(stack.pop());continue;}
    let before=null;
    if(frame.via>=0){const previous=edges[frame.via],g=previous.geometry;before=previous.b===at?g[g.length-2]:g[1];}
    const score=id=>{const e=edges[id],g=e.geometry,q=e.a===at?g[1]:g[g.length-2];let turn=0;if(before)turn=1-((p[0]-before[0])*(q[0]-p[0])+(p[1]-before[1])*(q[1]-p[1]))/(distance(before,p)*distance(p,q)||1);return turn+rank(points[other(id,at)])*.18+(e.bridge?.08:0);};
    const id=choices.reduce((a,b)=>score(b)<score(a)?b:a);used[id]=1;stack.push({at:other(id,at),via:id});
  }
  const order=reversed.reverse(),route=[points[origin]],edgeIds=[],visits=new Uint8Array(edges.length);
  for(let i=1;i<order.length;i++){
    const id=order[i].via,e=edges[id],from=order[i-1].at,to=order[i].at;
    if(!e||other(id,from)!==to||visits[id]++)throw new Error('중복 없는 한붓 경로 검사에 실패했습니다.');
    const geometry=e.a===from?e.geometry:[...e.geometry].reverse(),sampled=samplePath(geometry);route.push(...sampled.slice(1));edgeIds.push(id);
  }
  if(edgeIds.length!==edges.length)throw new Error('한붓 경로에 연결되지 않은 선이 있습니다.');
  const audit=new InkIndex();let overlappingSegments=0;
  for(let i=1;i<route.length;i++){if(audit.overlaps(route[i-1],route[i]))overlappingSegments++;audit.add(route[i-1],route[i]);}
  if(overlappingSegments)throw new Error('같은 선을 다시 지나는 경로가 발견되었습니다. 선화 정리 또는 세부 묘사를 낮춰 주세요.');
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const[x,y]of route){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  return { points:route,edgeIds,bounds:{x:x0,y:y0,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0)},stats:{...graph.stats,connectionCount:connections+graph.stats.bridgeCount,connectionLength:connectionLength+graph.stats.bridgeLength,originalEdgeCount:graph.edges.filter(e=>!e.bridge).length,totalEdges:edges.length,uniqueEdges:edgeIds.length,retraceLength:0,overlappingSegments,penLifts:0,paths:1} };
}

export function continuousPath(trace, start = 'bottom', cleanup = 0, contourOnly = false) {
  cleanup=Math.round(Math.max(0,Math.min(100,Number(cleanup)||0)));
  let variants=cache.get(trace);
  if(!variants){variants=new Map();cache.set(trace,variants);}
  const key=`${cleanup}:${contourOnly}`;
  let entry=variants.get(key);
  if(!entry){entry={graph:buildGraph(trace,cleanup,contourOnly),routes:new Map()};variants.set(key,entry);if(variants.size>4)variants.delete(variants.keys().next().value);}
  if (!entry.routes.has(start)) entry.routes.set(start, walk(entry.graph, start, trace.bounds));
  return entry.routes.get(start);
}
