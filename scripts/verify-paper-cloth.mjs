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
for(const dt of [1/120,1/60,1/30])for(const height of [378,860]){
  const cloth=new PaperCloth(326,height,16,Math.min(36,Math.ceil(height/19)));
  let seed=1057;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let grab=0;grab<24;grab++){
    const u=.03+random()*.94,v=.07+random()*.91;
    for(let frame=0;frame<8;frame++){
      cloth.hold({u,v,x:(random()-.5)*1600,y:(random()-.35)*1800,z:random()*500});
      cloth.step(dt*.5);cloth.step(dt*.5);
      assert.ok(cloth.nodes.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
    }
    if(grab%3===0){cloth.release();cloth.step(dt);}
  }
  cloth.release();for(let t=0;t<2.1;t+=dt){cloth.step(dt*.5);cloth.step(dt*.5);}
  assert.ok(cloth.settled,"violent shaking and rapid regrabs must recover");
  assert.ok(cloth.nodes.every(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)<.01),"even tangled starting shapes return exactly to the original sheet");
  console.log(`PASS adversarial shake/regrab and bounded recovery: ${Math.round(1/dt)}Hz, height ${height}`);passed++;
}
console.log(`${passed} total cloth cases passed`);
