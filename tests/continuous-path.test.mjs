import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { continuousPath } from '../js/continuous-path.js';
import { makeScene, tipAt, cameraAt } from '../js/engine.js';
const options={width:2.6,pressure:70,human:55,duration:20,fps:30,camera:'mystery',start:'bottom',background:16,pen:true,aspect:'9:16'};
const fixture=paths=>({paths,width:120,height:120,bounds:{x:5,y:5,w:100,h:100}});
function verifyNoOverdraw(route){
  assert.equal(route.stats.retraceLength,0);assert.equal(route.stats.overlappingSegments,0);
  assert.equal(route.edgeIds.length,new Set(route.edgeIds).size);
  const segs=[];for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1e-8)continue;
    for(const[c,d]of segs){if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-1e-6||Math.min(a[0],b[0])>Math.max(c[0],d[0])+1e-6||Math.max(a[1],b[1])<Math.min(c[1],d[1])-1e-6||Math.min(a[1],b[1])>Math.max(c[1],d[1])+1e-6)continue;
      const cross1=dx*(c[1]-a[1])-dy*(c[0]-a[0]),cross2=dx*(d[1]-a[1])-dy*(d[0]-a[0]);if(Math.abs(cross1)>length*1e-6||Math.abs(cross2)>length*1e-6)continue;
      const u=((c[0]-a[0])*dx+(c[1]-a[1])*dy)/length,v=((d[0]-a[0])*dx+(d[1]-a[1])*dy)/length;
      assert(Math.min(length,Math.max(u,v))-Math.max(0,Math.min(u,v))<1e-5,'two sections share a positive line length');}
    segs.push([a,b]);}
}
const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
function verifyScene(scene){
  assert.equal(scene.continuity.paths,1);assert.equal(scene.continuity.penLifts,0);
  assert.equal(scene.strokes[0].start,0);assert.equal(scene.strokes.at(-1).end,scene.options.duration);
  for(let i=1;i<scene.strokes.length;i++){const a=scene.strokes[i-1],b=scene.strokes[i];assert(same(a.points.at(-1),b.points[0]));assert.equal(a.end,b.start);assert.equal(a.widths.at(-1),b.widths[0]);}
  let previous;for(let t=0;t<scene.options.duration;t+=1/scene.options.fps){const p=tipAt(scene,t);assert(p.drawing);if(previous)assert(Math.hypot(p.x-previous.x,p.y-previous.y)<=Math.max(12,100*.4)/30+1e-6);previous=p;}
  assert.deepEqual(cameraAt(scene,scene.duration-3),cameraAt(scene,scene.duration));
}
test('an open line is traversed exactly once without added ink',()=>{const trace=fixture([[[10,100],[10,50],[70,50]]]),route=continuousPath(trace);assert.equal(route.stats.bridgeCount,0);assert.equal(route.stats.retraceLength,0);assert(same(route.points[0],[10,100]));assert(same(route.points.at(-1),[70,50]));});
test('a T junction receives new ink instead of a reverse traversal',()=>{const trace=fixture([[[50,100],[50,50]],[[10,50],[50,50]],[[50,50],[90,50]]]),route=continuousPath(trace);assert.equal(route.stats.connectionCount,1);verifyNoOverdraw(route);for(const endpoint of[[50,100],[10,50],[90,50]])assert(route.points.some(p=>same(p,endpoint)));assert(route.points.some(([x,y])=>Math.abs(x-50)>1e-6&&Math.abs(y-50)>1e-6));});
test('disconnected contours receive the shortest visible bridge',()=>{const trace=fixture([[[10,10],[50,10]],[[10,20],[50,20]]]),route=continuousPath(trace);assert.equal(route.stats.components,2);assert.equal(route.stats.bridgeCount,1);assert.equal(route.stats.bridgeLength,10);assert(route.points.some(p=>p[1]>10&&p[1]<20));verifyNoOverdraw(route);});
test('closed loops and branches retain every sampled contour',()=>{const trace=fixture([[[10,10],[60,10],[60,60],[10,60],[10,10]],[[60,60],[95,95]],[[60,10],[95,10]]]),route=continuousPath(trace);for(const path of trace.paths)for(const p of path)assert(route.points.some(q=>same(p,q)));assert.equal(route.stats.bridgeCount,0);verifyNoOverdraw(route);});
test('all output frame rates keep position, clock and pressure continuous',()=>{const trace=fixture([[[10,100],[10,10],[100,10],[100,100]],[[10,10],[100,100]]]);for(const fps of[30,24,18])for(const start of['bottom','top','left'])verifyScene(makeScene(trace,{...options,fps,start}));});
test('pressure zero uses constant width including cache seams',()=>{const scene=makeScene(fixture([[[10,100],[10,10],[100,10]]]),{...options,pressure:0});for(const s of scene.strokes)for(const width of s.widths)assert.equal(width,options.width);});
test('raster extraction preserves short junction links before simplification',()=>{const width=120,height=120,pixels=new Uint8ClampedArray(width*height*4).fill(255);for(let y=20;y<101;y++)for(let x=59;x<62;x++){const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}for(let y=19;y<22;y++)for(let x=15;x<106;x++){const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}let trace;const context={self:{postMessage:m=>{if(m.result)trace=m.result;if(m.error)throw Error(m.error);}},Float32Array,Uint8Array,Math};vm.createContext(context);vm.runInContext(readFileSync(new URL('../js/trace-worker.js',import.meta.url),'utf8'),context);context.self.onmessage({data:{pixels,width,height,mode:'line',detail:55}});assert(trace);assert.equal(continuousPath(trace).stats.bridgeCount,0);assert(continuousPath(trace).points.some(p=>p[0]>100));assert(continuousPath(trace).points.some(p=>p[0]<20));assert(continuousPath(trace).points.some(p=>p[1]>95));});

test('partially overlapping input strokes are unioned rather than redrawn',()=>{const route=continuousPath(fixture([[[10,10],[60,10]],[[35,10],[90,10]],[[90,10],[35,10]]]));verifyNoOverdraw(route);assert.equal(route.stats.originalLength,80);assert.equal(route.stats.connectionCount,0);});
test('an added connection never reuses an existing edge between the same junctions',()=>{const route=continuousPath(fixture([[[30,30],[80,30],[60,80],[30,30]],[[30,30],[5,10]],[[80,30],[100,100]]]));verifyNoOverdraw(route);assert(route.stats.connectionCount>0);});
test('a closed loop needs no added stroke and no retracing',()=>{const route=continuousPath(fixture([[[10,10],[90,10],[90,90],[10,90],[10,10]]]));verifyNoOverdraw(route);assert.equal(route.stats.connectionCount,0);assert(same(route.points[0],route.points.at(-1)));});
test('reference artwork has no overlapping line sections for all start positions',()=>{const trace=JSON.parse(readFileSync(new URL('./fixtures/reference-trace.json',import.meta.url)));for(const start of['bottom','top','left']){const route=continuousPath(trace,start);verifyNoOverdraw(route);assert(route.stats.originalLength>7500);assert.equal(route.stats.paths,1);assert.equal(route.stats.penLifts,0);}});
