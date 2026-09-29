import test from 'node:test';
import assert from 'node:assert/strict';
import{matchEndpoints}from'../js/route-matching.js';
import{continuousPath}from'../js/continuous-path.js';
import{InkIndex}from'../js/pen-geometry.js';
const rank=n=>n;
test('exact matching optimizes the ending point as well as the pairings',()=>{
 const cost=(a,b)=>{const key=[a,b].sort().join(':');return key==='1:2'||key==='3:5'?1:key==='3:4'?100:10;};
 const result=matchEndpoints([0,1,2,3,4,5],0,cost,rank);
 assert.equal(result.cost,2);assert.equal(result.baselineCost,101);assert.equal(result.method,'exact');assert.deepEqual(new Set(result.pairs.flat()),new Set([1,2,3,5]));
});
test('larger endpoint sets compare multiple complete plans without losing endpoints',()=>{
 const ids=Array.from({length:40},(_,i)=>i),cost=(a,b)=>Math.hypot(Math.sin(a)*100-Math.sin(b)*100,a-b);
 const result=matchEndpoints(ids,0,cost,rank),used=result.pairs.flat();assert(result.cost<=result.baselineCost);assert.equal(used.length,38);assert.equal(new Set(used).size,38);assert(!used.includes(0));assert.equal(result.method,'multi-start-2opt');
});
test('separated branched subjects all survive in a single non-retracing route',()=>{
 const paths=[];for(let i=0;i<4;i++){const x=80+i*240;paths.push([[x,100],[x,500]],[[x,300],[x+80,300]],[[x,500],[x+90,500],[x+90,700]]);}
 const r=continuousPath({paths,width:1100,height:900,bounds:{x:80,y:100,w:810,h:600}},'bottom',0,true),audit=new InkIndex();assert.equal(r.stats.paths,1);assert.equal(r.stats.penLifts,0);
 for(let i=1;i<r.points.length;i++){assert(!audit.overlaps(r.points[i-1],r.points[i]));audit.add(r.points[i-1],r.points[i]);}
 for(const path of paths)for(const p of path)assert(r.points.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6));
});
test('cleanup cannot turn a usable tiny drawing into an empty failed plan',()=>{
 const r=continuousPath({paths:[[[50,49],[50,50]],[[49,50],[50,50]],[[50,50],[51,50]]],width:1100,height:1100,bounds:{x:49,y:49,w:2,h:1}},'bottom',100,true);assert(r.points.length>1);assert.equal(r.stats.paths,1);
});
