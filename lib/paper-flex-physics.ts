export type RibbonPoint = { x:number;y:number;z:number;vx:number;vy:number;vz:number };
export type RibbonGrab = { index:number;x:number;y:number;z:number;twist:number };
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));

// An inextensible, top-pinned ribbon. The centreline controls a succession of
// small paper surfaces; the actual document is clipped onto those surfaces.
export class PaperRibbon {
  points:RibbonPoint[];
  readonly length:number;
  readonly count:number;
  readonly height:number;
  grab:RibbonGrab|null=null;
  target:RibbonGrab|null=null;
  twist=0;
  private windX=0;
  private windZ=0;
  constructor(height:number,count=28) {
    this.height=height;this.count=count;this.length=height/count;
    this.points=Array.from({length:count+1},(_,i)=>({x:0,y:i*this.length,z:0,vx:0,vy:0,vz:0}));
  }
  hold(target:RibbonGrab) {
    const index=clamp(target.index,2,this.count);
    this.target={...target,index};
    if(!this.grab){const p=this.points[index];this.grab={index,x:p.x,y:p.y,z:p.z,twist:this.twist};}
  }
  release(){this.target=null;this.grab=null;this.windX=0;this.windZ=0;}
  gust(x:number,z:number){this.windX=clamp(x,-.65,.65);this.windZ=clamp(z,0,.85);}
  step(dt:number){
    const f=clamp(dt*60,.25,1.5);
    const before=this.points.map(p=>({x:p.x,y:p.y,z:p.z}));
    const damping=Math.pow(this.grab ? .94 : .95,f);
    if(this.target&&this.grab){
      const blend=1-Math.pow(.64,f);
      for(const axis of ["x","y","z","twist"] as const)this.grab[axis]+=(this.target[axis]-this.grab[axis])*blend;
      const originY=this.length,available=(this.grab.index-1)*this.length*.997;
      const dy=this.grab.y-originY,dist=Math.hypot(this.grab.x,dy,this.grab.z);
      if(dist>available){const r=available/dist;this.grab.x*=r;this.grab.y=originY+dy*r;this.grab.z*=r;}
    }
    this.twist+=( (this.grab?.twist||0)-this.twist)*(1-Math.pow(.88,f));
    for(let i=2;i<=this.count;i++){
      const p=this.points[i],t=i/this.count;
      p.vx=(p.vx+(-p.x*.018+this.windX*t)*f)*damping;
      p.vy=(p.vy+((i*this.length-p.y)*.004+.025)*f)*damping;
      p.vz=(p.vz+(-p.z*.0018+this.windZ*t)*f)*damping;
      p.x+=p.vx*f;p.y+=p.vy*f;p.z+=p.vz*f;
    }
    for(let iteration=0;iteration<14;iteration++){
      for(let i=0;i<2;i++)Object.assign(this.points[i],{x:0,y:i*this.length,z:0});
      if(this.grab)Object.assign(this.points[this.grab.index],{x:this.grab.x,y:this.grab.y,z:this.grab.z});
      for(let i=1;i<=this.count;i++){
        const a=this.points[i-1],b=this.points[i],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
        const distance=Math.max(.0001,Math.hypot(dx,dy,dz)),error=(distance-this.length)/distance;
        const wa=i-1<2||i-1===this.grab?.index?0:1,wb=i<2||i===this.grab?.index?0:1,total=wa+wb;
        if(total){a.x+=dx*error*wa/total;a.y+=dy*error*wa/total;a.z+=dz*error*wa/total;b.x-=dx*error*wb/total;b.y-=dy*error*wb/total;b.z-=dz*error*wb/total;}
      }
      // A light bending constraint spreads sharp kinks over neighbouring rows.
      for(let i=2;i<this.count;i++){
        if(i===this.grab?.index)continue;
        const p=this.points[i],a=this.points[i-1],b=this.points[i+1];
        p.x+=((a.x+b.x)*.5-p.x)*.12;p.y+=((a.y+b.y)*.5-p.y)*.08;p.z+=((a.z+b.z)*.5-p.z)*.12;
      }
    }
    for(let i=2;i<=this.count;i++){
      const p=this.points[i];
      p.z=Math.max(0,p.z);p.vx=clamp((p.x-before[i].x)/f,-18,18);p.vy=clamp((p.y-before[i].y)/f,-18,18);p.vz=clamp((p.z-before[i].z)/f,-18,18);
    }
    this.windX*=Math.pow(.94,f);this.windZ*=Math.pow(.94,f);
  }
  get settled(){return !this.grab&&Math.abs(this.twist)<.1&&this.points.every((p,i)=>Math.hypot(p.x,p.y-i*this.length,p.z)<1.1&&Math.hypot(p.vx,p.vy,p.vz)<.12);}
}
