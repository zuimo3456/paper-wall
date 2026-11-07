export type ClothNode={x:number;y:number;z:number;vx:number;vy:number;vz:number;rx:number;ry:number;fixed:boolean};
export type ClothContact={u:number;v:number;x:number;y:number;z:number};
type Link={a:number;b:number;length:number;stiffness:number};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

// A sheet rather than a chain: structural, shear and bending constraints run in
// both directions. Barycentric weights pin the exact picked triangle point,
// matching the rendered surface instead of moving an entire horizontal row.
export class PaperCloth{
  readonly nodes:ClothNode[]=[];
  readonly links:Link[]=[];
  readonly triangles:Uint16Array;
  readonly columns:number;
  readonly rows:number;
  readonly width:number;
  readonly height:number;
  grab:ClothContact|null=null;
  private target:ClothContact|null=null;
  private weights:{index:number;weight:number}[]=[];
  private before:Float64Array;
  private windX=0;
  private windZ=0;
  private returnAge:number|null=null;
  private stuckAge=0;
  private bestDeviation=Infinity;
  private recoveryStart:Float64Array|null=null;
  private recoveryAge=0;
  constructor(width:number,height:number,columns=16,rows=24){
    this.width=width;this.height=height;this.columns=columns;this.rows=rows;
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
      const rx=x*width/columns,ry=y*height/rows;
      this.nodes.push({x:rx,y:ry,z:0,vx:0,vy:0,vz:0,rx,ry,fixed:y===0});
    }
    this.before=new Float64Array(this.nodes.length*3);
    const add=(a:number,b:number,stiffness:number)=>{const p=this.nodes[a],q=this.nodes[b];this.links.push({a,b,stiffness,length:Math.hypot(p.rx-q.rx,p.ry-q.ry)});};
    const tris:number[]=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
      const a=this.index(x,y);
      if(x<columns)add(a,this.index(x+1,y),1);
      if(y<rows)add(a,this.index(x,y+1),1);
      if(x<columns&&y<rows){
        const b=this.index(x+1,y),c=this.index(x,y+1),d=this.index(x+1,y+1);
        add(a,d,.72);add(b,c,.72);tris.push(a,b,c,b,d,c);
      }
      if(x+2<=columns)add(a,this.index(x+2,y),.13);
      if(y+2<=rows)add(a,this.index(x,y+2),.13);
    }
    this.triangles=new Uint16Array(tris);
  }
  index(x:number,y:number){return y*(this.columns+1)+x;}
  hold(value:ClothContact){
    this.returnAge=null;
    this.stuckAge=0;this.bestDeviation=Infinity;this.recoveryStart=null;this.recoveryAge=0;
    const u=clamp(value.u,.01,.99),v=clamp(value.v,1.5/this.rows,.995);
    if(!this.grab||Math.abs(this.grab.u-u)>.0001||Math.abs(this.grab.v-v)>.0001){
      const gx=u*this.columns,gy=v*this.rows,x=Math.floor(gx),y=Math.floor(gy),tx=gx-x,ty=gy-y;
      this.weights=tx+ty<=1
        ?[{index:this.index(x,y),weight:1-tx-ty},{index:this.index(x+1,y),weight:tx},{index:this.index(x,y+1),weight:ty}]
        :[{index:this.index(x+1,y),weight:1-ty},{index:this.index(x+1,y+1),weight:tx+ty-1},{index:this.index(x,y+1),weight:1-tx}];
      const contact=this.contact();this.grab={u,v,...contact};
    }
    const anchorX=u*this.width,length=v*this.height*.997,dx=value.x-anchorX,dy=value.y,distance=Math.hypot(dx,dy,value.z),ratio=Math.min(1,length/Math.max(distance,.001));
    this.target={u,v,x:anchorX+dx*ratio,y:dy*ratio,z:clamp(value.z*ratio,0,320)};
  }
  contact(){let x=0,y=0,z=0;for(const a of this.weights){const p=this.nodes[a.index];x+=p.x*a.weight;y+=p.y*a.weight;z+=p.z*a.weight;}return {x,y,z};}
  release(){this.target=null;this.grab=null;this.weights=[];this.windX=0;this.windZ=0;this.returnAge??=0;}
  gust(x:number,z:number){this.returnAge=null;this.stuckAge=0;this.bestDeviation=Infinity;this.recoveryStart=null;this.recoveryAge=0;this.windX=clamp(x,-.65,.65);this.windZ=clamp(z,0,.7);}
  private constrainGrab(){
    if(!this.grab)return;
    const current=this.contact(),denominator=this.weights.reduce((sum,a)=>sum+(this.nodes[a.index].fixed?0:a.weight*a.weight),0);
    if(denominator<.00001)return;
    const dx=this.grab.x-current.x,dy=this.grab.y-current.y,dz=this.grab.z-current.z;
    for(const a of this.weights){const p=this.nodes[a.index];if(p.fixed)continue;const weight=a.weight/denominator;p.x+=dx*weight;p.y+=dy*weight;p.z+=dz*weight;}
  }
  step(dt:number){
    if(this.returnAge!==null&&!this.grab)this.returnAge+=dt;
    const f=clamp(dt*60,.01,1),damping=Math.pow(this.grab ? .95 : .978,f);
    // A rare, motionless tangle uses a slow, eased unfold. It does not apply
    // to ordinary releases and cannot inject artificial recoil into velocity.
    if(this.recoveryStart){
      this.recoveryAge+=dt;const t=Math.min(1,this.recoveryAge/3.2),mix=t*t*t*(t*(6*t-15)+10);
      for(let i=0;i<this.nodes.length;i++){
        const p=this.nodes[i],x=p.x,y=p.y,z=p.z;
        p.x=this.recoveryStart[i*3]+(p.rx-this.recoveryStart[i*3])*mix;p.y=this.recoveryStart[i*3+1]+(p.ry-this.recoveryStart[i*3+1])*mix;p.z=this.recoveryStart[i*3+2]*(1-mix);
        p.vx=(p.x-x)/f;p.vy=(p.y-y)/f;p.vz=(p.z-z)/f;
      }
      return;
    }
    // Track actual unfolding progress, not just velocity. Intersecting folds
    // can keep jittering indefinitely without getting any closer to flat.
    if(this.returnAge!==null){
      let deviation=0;for(const p of this.nodes)deviation=Math.max(deviation,Math.hypot(p.x-p.rx,p.y-p.ry,p.z));
      if(!Number.isFinite(this.bestDeviation)||deviation<this.bestDeviation-Math.max(.2,this.bestDeviation*.015)){this.bestDeviation=deviation;this.stuckAge=0;}
      else this.stuckAge+=dt;
      if(this.returnAge>2.8&&deviation>2&&this.stuckAge>1.8){this.recoveryStart=new Float64Array(this.nodes.flatMap(p=>[p.x,p.y,p.z]));this.recoveryAge=0;return;}
    }
    const springX=this.grab ? .0025 : .0006;
    const springY=this.grab ? .002 : .00045;
    const springZ=this.grab ? .0015 : .0003;
    if(this.target&&this.grab){const mix=1-Math.pow(.6,f);this.grab.x+=(this.target.x-this.grab.x)*mix;this.grab.y+=(this.target.y-this.grab.y)*mix;this.grab.z+=(this.target.z-this.grab.z)*mix;}
    for(let i=0;i<this.nodes.length;i++){
      const p=this.nodes[i];this.before[i*3]=p.x;this.before[i*3+1]=p.y;this.before[i*3+2]=p.z;if(p.fixed)continue;
      const t=p.ry/this.height;
      p.vx=(p.vx+((p.rx-p.x)*springX+this.windX*t)*f)*damping;
      p.vy=(p.vy+((p.ry-p.y)*springY+.004)*f)*damping;
      p.vz=(p.vz+(-p.z*springZ+this.windZ*t)*f)*damping;
      p.x+=p.vx*f;p.y+=p.vy*f;p.z+=p.vz*f;
    }
    for(let iteration=0;iteration<9;iteration++){
      for(const link of this.links){
        const a=this.nodes[link.a],b=this.nodes[link.b],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,distance=Math.max(.00001,Math.hypot(dx,dy,dz));
        const wa=a.fixed?0:1,wb=b.fixed?0:1,total=wa+wb;if(!total)continue;
        const correction=(distance-link.length)/distance*link.stiffness/total;
        if(wa){a.x+=dx*correction;a.y+=dy*correction;a.z+=dz*correction;}if(wb){b.x-=dx*correction;b.y-=dy*correction;b.z-=dz*correction;}
      }
      this.constrainGrab();
      for(const p of this.nodes)if(p.fixed){p.x=p.rx;p.y=p.ry;p.z=0;}
    }
    for(let i=0;i<this.nodes.length;i++){
      const p=this.nodes[i];if(p.fixed)continue;p.z=Math.max(0,p.z);
      p.vx=clamp((p.x-this.before[i*3])/f,-16,16);p.vy=clamp((p.y-this.before[i*3+1])/f,-16,16);p.vz=clamp((p.z-this.before[i*3+2])/f,-16,16);
    }
    this.windX*=Math.pow(.93,f);this.windZ*=Math.pow(.93,f);
  }
  get settled(){return !this.grab&&this.nodes.every(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)<1.8&&Math.hypot(p.vx,p.vy,p.vz)<.16);}
}
