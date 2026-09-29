import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{continuousPath}from'../js/continuous-path.js';
import{cleanContours}from'../js/contour-cleanup.js';
import{eraseContourAt}from'../js/erase-line.js';
import{InkIndex,uniqueSegments,cleanJunctions}from'../js/pen-geometry.js';
const trace=paths=>({paths,width:1100,height:1100,bounds:{x:10,y:10,w:980,h:980}});
test('no connector crosses the empty space between two subjects',()=>{
 const t=trace([[[100,100],[100,500],[500,500],[500,100]],[[100,300],[130,300]],[[500,300],[470,300]]]);
 const route=continuousPath(t,'bottom',0,true),support=new InkIndex(),audit=new InkIndex();for(const p of t.paths)support.addPath(p);
 for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i];assert(!audit.overlaps(a,b));audit.add(a,b);for(const f of[0,.5,1]){const p=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];assert(support.clearance(p,4)<=2.81,'a connection left the existing contour corridor');assert(!(p[0]>140&&p[0]<460&&p[1]>150&&p[1]<450),'ink crossed empty space');}}
 assert.equal(route.stats.penLifts,0);assert.equal(route.stats.paths,1);assert.equal(route.stats.overlappingSegments,0);
});
test('truly separate subjects are not joined by an invented long stroke',()=>{
 assert.throws(()=>continuousPath(trace([[[100,100],[100,500]],[[500,100],[500,500]]]),'bottom',0,true),/빈 공간/);
});
test('cleanup removes a short twig and speck but preserves structural junction links',()=>{
 const segments=[[[100,100],[100,300]],[[100,300],[100,500]],[[100,300],[112,300]],[[100,500],[110,500]],[[110,500],[110,900]],[[110,500],[600,500]],[[800,50],[810,50]]];
 const result=cleanContours(segments,65,1100,1100);assert.equal(result.removedComponents,1);assert.equal(result.removedDetails,1);assert(result.segments.some(([a,b])=>a[1]===500&&a[0]===100&&b[0]===110));assert.equal(cleanContours(segments,0,1100,1100).segments,segments);
});
test('deleting a selected line preserves adjacent curved contours and source trace',()=>{
 const t=trace([[[10,10],[20,20],[70,20],[120,20],[130,40]],[[10,10],[10,80]]]),before=JSON.stringify(t),edited=eraseContourAt(t,[80,20],4);
 assert.equal(JSON.stringify(t),before);assert.deepEqual(edited.paths,[[[10,10],[20,20]],[[120,20],[130,40]],[[10,10],[10,80]]]);assert.equal(eraseContourAt(t,[400,400],4),null);
});
test('reference retains its main contours, with no unsupported long connections',()=>{
 const t=JSON.parse(readFileSync(new URL('./fixtures/reference-trace.json',import.meta.url))),support=new InkIndex();for(const p of cleanJunctions(uniqueSegments(t.paths)).segments)support.addPath(p);
 for(const start of['bottom','top','left']){const r=continuousPath(t,start,65,true);assert(r.stats.originalLength>7500);assert.equal(r.stats.penLifts,0);assert.equal(r.stats.overlappingSegments,0);assert(r.stats.removedDetails>0);for(const p of r.points)assert(support.clearance(p,4)<=2.81);}
});
