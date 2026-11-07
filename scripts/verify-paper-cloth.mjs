import assert from "node:assert/strict";
import {PaperCloth} from "../lib/paper-cloth-physics.ts";
import {intersections} from "./paper-intersections.mjs";
let passed=0;
for(const dt of [1/120,1/60,1/30]){
  for(const point of [{u:.35,v:.65,x:120,y:190,z:160},{u:.89,v:.94,x:300,y:190,z:220}]){
    const cloth=new PaperCloth(320,430,16,24);
    const advance=()=>{cloth.step(dt*.5);cloth.step(dt*.5);};
    cloth.hold(point);for(let t=0;t<2;t+=dt)advance();
    const contact=cloth.contact();assert.ok(Math.hypot(contact.x-point.x,contact.y-point.y,contact.z-point.z)<12,"ordinary picked surface point follows within the smooth mesh's discretization tolerance");
    assert.ok(cloth.nodes.every(p=>[p.x,p.y,p.z,p.vx,p.vy,p.vz].every(Number.isFinite)));
    assert.ok(cloth.nodes.filter(p=>p.fixed).every(p=>p.x===p.rx&&p.y===p.ry&&p.z===0),"top edge stays pinned");
    const row=Math.round(point.v*cloth.rows),depths=Array.from({length:cloth.columns+1},(_,x)=>cloth.nodes[cloth.index(x,row)].z);
    assert.ok(Math.max(...depths)-Math.min(...depths)>30,"deformation is local across the row, not a horizontal strip");
    assert.equal(intersections(cloth,1),0,"the paper cannot cross itself while held");
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
  cloth.release();for(let t=0;t<12;t+=dt){cloth.step(dt*.5);cloth.step(dt*.5);}
  assert.ok(cloth.settled,"violent shaking and rapid regrabs must recover");
  assert.ok(cloth.nodes.every(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)<1.8),"extreme folds eventually settle without a forced reset");
  console.log(`PASS adversarial shake/regrab and bounded recovery: ${Math.round(1/dt)}Hz, height ${height}`);passed++;
}
console.log(`${passed} total cloth cases passed`);
for(const height of [378,860,1800]){
  const cloth=new PaperCloth(326,height,10,18);let seed=7,maxIntersections=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<24;n++){const u=.15+random()*.7,v=.3+random()*.65;for(let f=0;f<10;f++){cloth.hold({u,v,x:(random()-.5)*1300,y:(random()-.3)*height*2,z:random()*450});cloth.step(1/60);}maxIntersections=Math.max(maxIntersections,intersections(cloth,1));cloth.release();cloth.step(1/60);}
  assert.equal(maxIntersections,0,"no accumulated crossings during rapid release/regrab, not just after recovery");cloth.release();for(let n=0;n<360;n++)cloth.step(1/60);assert.ok(cloth.settled);passed++;console.log(`PASS no self-intersection during 24 rapid regrabs, height ${height}`);
}
for(const hz of [5,15,30,60,165,240]){
  const cloth=new PaperCloth(326,860,12,28),dt=1/hz;cloth.hold({u:.75,v:.9,x:280,y:660,z:170});for(let t=0;t<2;t+=dt)cloth.step(dt);cloth.release();for(let t=0;t<8;t+=dt)cloth.step(dt);assert.ok(cloth.settled,`wall-clock recovery at ${hz}Hz`);passed++;console.log(`PASS real-time spring recovery at ${hz}Hz`);
}
console.log(`${passed} total stable-sheet cases passed`);
for(const [testSeed,height,hz] of [[7,378,60],[37,860,60],[891,1800,60],[1291,860,165],[9047,378,240],[27011,1800,120]]){
  const dt=1/hz,cloth=new PaperCloth(326,height,12,Math.min(36,Math.ceil(height/19)));let seed=testSeed;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<30;n++){const u=.03+random()*.94,v=.07+random()*.91;for(let f=0;f<5;f++){cloth.hold({u,v,x:(random()-.5)*1800,y:(random()-.3)*height*2,z:random()*700});cloth.step(dt*.5);cloth.step(dt*.5);}if(n%2===0){cloth.release();cloth.step(dt);}}
  cloth.release();for(let t=0;t<16;t+=dt){cloth.step(dt*.5);cloth.step(dt*.5);}
  assert.ok(cloth.nodes.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));assert.ok(cloth.settled,`jittering/intersecting fold must recover: seed ${testSeed}, ${hz}Hz`);
  passed++;console.log(`PASS randomized tangle recovery: seed ${testSeed}, height ${height}, ${hz}Hz`);
}
console.log(`${passed} total cloth cases passed`);
for(const dt of [1/120,1/60,1/30]){
  const cloth=new PaperCloth(326,378,16,20),advance=()=>{cloth.step(dt*.5);cloth.step(dt*.5);};
  cloth.hold({u:.89,v:.94,x:290,y:208,z:190});for(let t=0;t<1.5;t+=dt)advance();
  const initial=Math.max(...cloth.nodes.map(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)));cloth.release();
  for(let t=0;t<.5;t+=dt)advance();
  const remaining=Math.max(...cloth.nodes.map(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)));
  assert.ok(remaining>initial*.5,"release retains a visible, gently moving fold instead of being pulled flat immediately");
  for(let t=.5;t<1.9;t+=dt)advance();
  assert.ok(Math.max(...cloth.nodes.map(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)))>8,"no 1.8-second forced flattening deadline");
  for(let t=1.9;t<9;t+=dt)advance();assert.ok(cloth.settled);
  passed++;console.log(`PASS soft release, no timed snap, eventual settlement: ${Math.round(1/dt)}Hz`);
}
console.log(`${passed} total cloth cases passed`);
