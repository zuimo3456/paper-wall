import assert from "node:assert/strict";
import {PaperCloth} from "../lib/paper-cloth-physics.ts";
let passed=0;
for(const dt of [1/120,1/60,1/30]){
  for(const point of [{u:.35,v:.65,x:120,y:190,z:160},{u:.89,v:.94,x:300,y:190,z:220}]){
    const cloth=new PaperCloth(320,430,16,24);
    const advance=()=>{cloth.step(dt*.5);cloth.step(dt*.5);};
    cloth.hold(point);for(let t=0;t<2;t+=dt)advance();
    const contact=cloth.contact();assert.ok(Math.hypot(contact.x-point.x,contact.y-point.y,contact.z-point.z)<1,"picked surface point follows the target");
    assert.ok(cloth.nodes.every(p=>[p.x,p.y,p.z,p.vx,p.vy,p.vz].every(Number.isFinite)));
    assert.ok(cloth.nodes.filter(p=>p.fixed).every(p=>p.x===p.rx&&p.y===p.ry&&p.z===0),"top edge stays pinned");
    const row=Math.round(point.v*cloth.rows),depths=Array.from({length:cloth.columns+1},(_,x)=>cloth.nodes[cloth.index(x,row)].z);
    assert.ok(Math.max(...depths)-Math.min(...depths)>30,"deformation is local across the row, not a horizontal strip");
    cloth.release();for(let t=0;t<7;t+=dt)advance();
    assert.ok(cloth.nodes.every(p=>p.z>=0),"wall blocks paper");
    const error=Math.max(...cloth.nodes.map(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)));
    assert.ok(error<1.1,`released sheet recovers: ${error}`);assert.ok(cloth.settled);
    console.log(`PASS ${Math.round(1/dt)}Hz grab ${point.u}: contact, local bend, pinned edge and recovery`);passed++;
  }
}
console.log(`${passed} cloth cases passed`);
