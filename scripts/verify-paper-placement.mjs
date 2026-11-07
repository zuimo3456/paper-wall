import assert from "node:assert/strict";
import {paperBounds,findEmptyPosition,overlaps,PAPER_GAP} from "../lib/paper-placement.ts";
const shape=(w,h,t=0)=>paperBounds({x:0,y:0},w,h,t);
const placed=(local,p)=>({left:local.left+p.x,right:local.right+p.x,top:local.top+p.y,bottom:local.bottom+p.y});
const footprint=shape(304,520,3);
assert.deepEqual(findEmptyPosition(footprint,[],{x:440,y:72}),{x:440,y:72});
const recent=paperBounds({x:56,y:62},326,780,-1.3);
const moved=findEmptyPosition(footprint,[recent],{x:100,y:100});assert.ok(moved);assert.ok(!overlaps(placed(footprint,moved),recent));
const old={x:440,y:72},blocker=placed(footprint,old),restored=findEmptyPosition(footprint,[recent,blocker],old);assert.ok(restored);assert.notDeepEqual(restored,old);assert.ok([recent,blocker].every(b=>!overlaps(placed(footprint,restored),b)));
const occupied=[recent];let seed=902;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<70;i++){
  const local=shape(304,250+random()*2300,-5+random()*10),preferred={x:-400+random()*1400,y:-200+random()*800};
  const p=findEmptyPosition(local,occupied,preferred);assert.ok(p,`empty position for variable-height paper ${i}`);assert.ok(p.x>=-2800&&p.x<=5800&&p.y>=-2800&&p.y<=5800);
  const rect=placed(local,p);assert.ok(occupied.every(b=>!overlaps(rect,b)),`paper ${i} must not overlap any existing paper or its gap`);occupied.push(rect);
}
assert.equal(findEmptyPosition(shape(304,800),[shape(304,800)],{x:0,y:0},{minX:0,maxX:0,minY:0,maxY:0}),null);
assert.ok(PAPER_GAP>=24);console.log('PASS preferred location, occupied restore slot, recent sheet, tilt, 70 mixed-height placements, coordinate bounds and no-space result');
