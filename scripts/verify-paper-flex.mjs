import assert from "node:assert/strict";
import { PaperRibbon } from "../lib/paper-flex-physics.ts";

let passed=0;
for(const dt of [1/120,1/60,1/30]){
  for(const grab of [{index:25,x:65,y:210,z:160,twist:18},{index:30,x:-90,y:110,z:230,twist:-22}]){
    const ribbon=new PaperRibbon(430,30);
    const advance=()=>{ribbon.step(dt*.5);ribbon.step(dt*.5);};
    ribbon.hold(grab);
    for(let time=0;time<2;time+=dt)advance();
    assert.equal(ribbon.points[0].x,0);assert.equal(ribbon.points[0].y,0);assert.equal(ribbon.points[0].z,0);
    assert.equal(ribbon.points[1].y,ribbon.length);assert.equal(ribbon.points[1].z,0);
    assert.ok(Math.max(...ribbon.points.map(p=>p.z))>100,"body must bend away from pinned top");
    assert.ok(ribbon.points.every(p=>Object.values(p).every(Number.isFinite)),"all coordinates remain finite");
    ribbon.release();
    for(let time=0;time<7;time+=dt)advance();
    assert.ok(ribbon.points.every(p=>p.z>=0),"paper cannot pass behind the wall");
    const deviation=Math.max(...ribbon.points.map((p,i)=>Math.hypot(p.x,p.y-i*ribbon.length,p.z)));
    assert.ok(deviation<1.1,`paper returns within one pixel of rest, got ${deviation}`);
    assert.ok(ribbon.settled,"release must settle instead of looping indefinitely");
    passed++;console.log(`PASS pinned top, curved body, finite simulation, wall contact and recovery at ${Math.round(1/dt)}Hz (${grab.index})`);
  }
}
const ribbon=new PaperRibbon(430,30);ribbon.gust(.5,.7);
for(let i=0;i<20;i++)ribbon.step(1/60);
assert.ok(ribbon.points[30].z>ribbon.points[1].z,"drag inertia is stronger at the free edge");
console.log(`PASS drag inertia; ${passed+1} cases passed`);
