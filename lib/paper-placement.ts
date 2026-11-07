export type Bounds={left:number;top:number;right:number;bottom:number};
export type Position={x:number;y:number};
export const PAPER_GAP=28;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
// Bounding box at rest, including tilt, protruding tape and a small shadow.
export function paperBounds(position:Position,width:number,height:number,tilt:number):Bounds{
  const angle=tilt*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),ox=width/2,oy=8;
  const points=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>({x:position.x+ox+(x-ox)*c-(y-oy)*s,y:position.y+oy+(x-ox)*s+(y-oy)*c}));
  return {left:Math.min(...points.map(p=>p.x))-8,top:Math.min(...points.map(p=>p.y))-18,right:Math.max(...points.map(p=>p.x))+8,bottom:Math.max(...points.map(p=>p.y))+10};
}
export function overlaps(a:Bounds,b:Bounds,gap=PAPER_GAP){return a.left<b.right+gap-.0001&&a.right>b.left-gap+.0001&&a.top<b.bottom+gap-.0001&&a.bottom>b.top-gap+.0001;}
export function findEmptyPosition(footprint:Bounds,occupied:Bounds[],preferred:Position,limits={minX:-2800,maxX:5800,minY:-2800,maxY:5800}):Position|null{
  const px=clamp(preferred.x,limits.minX,limits.maxX),py=clamp(preferred.y,limits.minY,limits.maxY);
  const xs=new Set([px,limits.minX,limits.maxX]),ys=new Set([py,limits.minY,limits.maxY]);
  for(const b of occupied){xs.add(clamp(b.right+PAPER_GAP-footprint.left,limits.minX,limits.maxX));xs.add(clamp(b.left-PAPER_GAP-footprint.right,limits.minX,limits.maxX));ys.add(clamp(b.bottom+PAPER_GAP-footprint.top,limits.minY,limits.maxY));ys.add(clamp(b.top-PAPER_GAP-footprint.bottom,limits.minY,limits.maxY));}
  const xx=[...xs].sort((a,b)=>Math.abs(a-px)-Math.abs(b-px)),yy=[...ys].sort((a,b)=>Math.abs(a-py)-Math.abs(b-py));
  let best:Position|null=null,score=Infinity;
  for(const x of xx){if((x-px)**2>score)break;for(const y of yy){const distance=(x-px)**2+(y-py)**2;if(distance>=score)continue;const bounds={left:x+footprint.left,right:x+footprint.right,top:y+footprint.top,bottom:y+footprint.bottom};if(occupied.every(b=>!overlaps(bounds,b))){best={x,y};score=distance;if(distance===0)return best;}}}
  return best;
}
