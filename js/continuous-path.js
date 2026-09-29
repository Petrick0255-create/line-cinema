// A pen-down route through every contour. New ink only crosses the shortest
// gaps between components; travel between branches follows existing ink.
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

function buildGraph(trace) {
  const points = [], edges = [], adjacent = [], byPoint = new Map(), byEdge = new Set();
  function vertex(p) {
    const key = p.map(n => Math.round(n * 10000)).join(',');
    if (byPoint.has(key)) return byPoint.get(key);
    const id = points.length; byPoint.set(key, id); points.push(p.slice()); adjacent.push([]); return id;
  }
  function edge(a, b, bridge = false) {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (byEdge.has(key)) return;
    byEdge.add(key); const id = edges.length;
    edges.push({ a, b, length: distance(points[a], points[b]), bridge }); adjacent[a].push(id); adjacent[b].push(id);
  }
  // Sampling also lets a disconnected endpoint attach close to the middle of
  // another contour, rather than drawing a long diagonal to its far endpoint.
  for (const path of trace.paths) {
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
    for (const e of [...candidates.values()].sort((a, b) => a.d - b.d || a.a - b.a)) if (union.join(e.a, e.b)) edge(e.a, e.b, true);
  }
  const bridges = edges.filter(e => e.bridge);
  return { points, edges, adjacent, stats: { components, bridgeCount: bridges.length, bridgeLength: bridges.reduce((n, e) => n + e.length, 0), maxBridge: Math.max(0, ...bridges.map(e => e.length)), originalLength: edges.filter(e => !e.bridge).reduce((n, e) => n + e.length, 0) } };
}

class MinHeap {
  constructor() { this.items = []; }
  push(item) { const a = this.items; let i = a.length; a.push(item); while (i) { const p = (i - 1) >> 1; if (a[p][0] <= item[0]) break; a[i] = a[p]; i = p; } a[i] = item; }
  pop() { const a = this.items, first = a[0], last = a.pop(); if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= last[0]) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
}
function walk(graph, start, bounds) {
  const { points, edges, adjacent } = graph;
  const rank = p => start === 'left' ? (p[0] - bounds.x) / bounds.w : start === 'top' ? (p[1] - bounds.y) / bounds.h : 1 - (p[1] - bounds.y) / bounds.h;
  const odd = points.map((_, i) => i).filter(i => adjacent[i].length % 2);
  const candidates = odd.length ? odd : points.map((_, i) => i).filter(i => adjacent[i].length);
  const origin = candidates.reduce((a, b) => rank(points[b]) < rank(points[a]) ? b : a);
  const count = new Uint32Array(edges.length).fill(1), available = new Uint8Array(points.length);
  const costs = new Float64Array(points.length), parent = new Int32Array(points.length), seen = new Uint32Array(points.length); let generation = 0;
  const other = (id, at) => edges[id].a === at ? edges[id].b : edges[id].a;
  function search(from, stopAtOdd) {
    generation++; const heap = new MinHeap(); heap.push([0, from]); seen[from] = generation; costs[from] = 0;
    while (heap.items.length) {
      const [cost, at] = heap.pop(); if (cost > costs[at]) continue;
      if (stopAtOdd && available[at] && at !== from) return at;
      for (const id of adjacent[at]) { const next = other(id, at), value = cost + edges[id].length; if (seen[next] !== generation || value < costs[next]) { seen[next] = generation; costs[next] = value; parent[next] = id; heap.push([value, next]); } }
    }
    return -1;
  }
  // Leave two odd vertices open as the beginning/end. Pair the others by
  // shortest graph paths. This reuses ink without retracing every branch twice.
  let retraceLength = 0;
  if (odd.length) {
    for (const id of odd) available[id] = 1;
    search(origin, false);
    const end = odd.filter(id => id !== origin).reduce((a, b) => costs[b] > costs[a] ? b : a);
    available[origin] = available[end] = 0;
    for (const from of [...odd].sort((a,b) => rank(points[a])-rank(points[b]) || a-b)) if (available[from]) {
      let target = search(from, true);
      if (target < 0) throw new Error('연속 경로를 완성하지 못했습니다. 선을 다시 추출해 주세요.');
      available[from] = available[target] = 0;
      while (target !== from) { const id = parent[target]; count[id]++; retraceLength += edges[id].length; target = other(id, target); }
    }
  }
  // Hierholzer traversal. The final walk consumes each required edge in one
  // continuous trail; local turn preference gives long, confident movements.
  const stack = [origin], reversed = [];
  while (stack.length) {
    const at = stack.at(-1), before = stack.length > 1 ? points[stack.at(-2)] : null;
    const choices = adjacent[at].filter(id => count[id]);
    if (!choices.length) { reversed.push(stack.pop()); continue; }
    const p = points[at];
    const score = id => { const e = edges[id], q = points[other(id,at)]; let turn = 0; if (before) turn = 1 - ((p[0]-before[0])*(q[0]-p[0])+(p[1]-before[1])*(q[1]-p[1]))/(distance(before,p)*e.length||1); return turn + rank(q)*.18 + (e.bridge?.08:0); };
    const id = choices.reduce((a,b) => score(b)<score(a)?b:a); count[id]--; stack.push(other(id,at));
  }
  const order = reversed.reverse(), route = [points[order[0]]];
  for (let i=1;i<order.length;i++) { const a=points[order[i-1]],b=points[order[i]],steps=Math.max(1,Math.ceil(distance(a,b)/2.5)); for(let j=1;j<=steps;j++){const f=j/steps;route.push(j===steps?b:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);} }
  return { points: route, stats: { ...graph.stats, retraceLength, penLifts: 0, paths: 1 } };
}

export function continuousPath(trace, start = 'bottom') {
  let entry = cache.get(trace);
  if (!entry) { entry = { graph: buildGraph(trace), routes: new Map() }; cache.set(trace, entry); }
  if (!entry.routes.has(start)) entry.routes.set(start, walk(entry.graph, start, trace.bounds));
  return entry.routes.get(start);
}
