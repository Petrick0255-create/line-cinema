import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScene } from '../js/engine.js';
import { promptForSpeed, speedProfile } from '../js/gemini.js';

const trace={
 paths:[[[10,100],[10,10],[100,10]]],
 width:120,
 height:120,
 bounds:{x:5,y:5,w:100,h:100}
};
const options={width:2.6,pressure:70,human:55,duration:40,fps:30,camera:'fixed',start:'bottom',background:16,cleanup:0,pen:true,aspect:'9:16'};

test('drawing speed changes actual drawing time while the seven-second ending stays fixed',()=>{
 const slow=makeScene(trace,{...options,speed:.5});
 const normal=makeScene(trace,{...options,speed:1});
 const fast=makeScene(trace,{...options,speed:2});
 const reel=makeScene(trace,{...options,speed:2.5});
 assert.equal(slow.options.duration,80);
 assert.equal(normal.options.duration,40);
 assert.equal(fast.options.duration,20);
 assert.equal(reel.options.duration,16);
 assert.equal(slow.duration,87);
 assert.equal(fast.duration,27);
 assert.equal(reel.duration,23);
});

test('faster speeds request fewer interior contours',()=>{
 const slow=promptForSpeed('BASE',.5);
 const fast=promptForSpeed('BASE',2.5);
 assert.match(slow,/24-32 short defining interior contours/);
 assert.match(fast,/2-4 defining interior contours/);
 assert.match(fast,/2\.50x drawing speed/);
 assert.equal(speedProfile(.5).label,'풍부한 선화');
 assert.equal(speedProfile(2.5).label,'릴스용 초간결 선화');
});

test('unsupported speed values are rejected before creating an order',()=>{
 assert.throws(()=>speedProfile(.25),/0\.5×/);
 assert.throws(()=>promptForSpeed('BASE',3),/2\.5×/);
});
