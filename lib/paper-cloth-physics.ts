export type ClothNode={x:number;y:number;z:number;vx:number;vy:number;vz:number;rx:number;ry:number;fixed:boolean};
export type ClothContact={u:number;v:number;x:number;y:number;z:number};
type Spring={value:number;velocity:number};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};

// Exact damped-spring integration keeps the same response at low frame rates,
// high refresh rates and after a suspended tab, without accumulating bad steps.
function advance(s:Spring,target:number,omega:number,damping:number,dt:number){
  const y=s.value-target,v=s.velocity,e=Math.exp(-omega*damping*dt);
  if(damping===1){const j=v+omega*y;s.value=target+e*(y+j*dt);s.velocity=e*(v-omega*j*dt);return;}
  const w=omega*Math.sqrt(1-damping*damping),c=Math.cos(w*dt),sn=Math.sin(w*dt),a=omega*damping;
  s.value=target+e*(y*c+(v+a*y)/w*sn);s.velocity=e*(v*c-(a*v+omega*omega*y)/w*sn);
}

// A bounded, smooth sheet instead of independent particles that can knot.
// Before the final invertible shear, columns occupy disjoint x slabs and
// advance monotonically in depth. Nonadjacent triangles cannot cross. A
// localized angle profile still gives point-dependent lift and an edge curl.
export class PaperCloth{
  readonly nodes:ClothNode[]=[];
  readonly triangles:Uint16Array;
  readonly columns:number;readonly rows:number;readonly width:number;readonly height:number;
  grab:ClothContact|null=null;
  private target:ClothContact|null=null;
  private weights:{index:number;weight:number}[]=[];
  private lift:Spring={value:0,velocity:0};
  private pull:Spring={value:0,velocity:0};
  private side:Spring={value:0,velocity:0};
  private anchorU:Spring={value:.5,velocity:0};
  private anchorV:Spring={value:.85,velocity:0};
  private gustValue:{x:number;z:number}|null=null;
  private initialized=false;

  constructor(width:number,height:number,columns=16,rows=24){
    this.width=width;this.height=height;this.columns=columns;this.rows=rows;
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){const rx=x*width/columns,ry=y*height/rows;this.nodes.push({x:rx,y:ry,z:0,vx:0,vy:0,vz:0,rx,ry,fixed:y===0});}
    const tris:number[]=[];for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=this.index(x,y),b=this.index(x+1,y),c=this.index(x,y+1),d=this.index(x+1,y+1);tris.push(a,b,c,b,d,c);}this.triangles=new Uint16Array(tris);
  }
  index(x:number,y:number){return y*(this.columns+1)+x;}
  hold(value:ClothContact){
    if(!Object.values(value).every(Number.isFinite))return;
    const u=clamp(value.u,.01,.99),v=clamp(value.v,1.5/this.rows,.995);
    if(!this.initialized||this.settled){this.anchorU={value:u,velocity:0};this.anchorV={value:v,velocity:0};this.lift={value:0,velocity:0};this.pull={value:0,velocity:0};this.side={value:0,velocity:0};this.initialized=true;}
    this.gustValue=null;this.target={...value,u,v};this.grab={...value,u,v};
    const gx=u*this.columns,gy=v*this.rows,x=Math.floor(gx),y=Math.floor(gy),tx=gx-x,ty=gy-y;
    this.weights=tx+ty<=1
      ?[{index:this.index(x,y),weight:1-tx-ty},{index:this.index(x+1,y),weight:tx},{index:this.index(x,y+1),weight:ty}]
      :[{index:this.index(x+1,y),weight:1-ty},{index:this.index(x+1,y+1),weight:tx+ty-1},{index:this.index(x,y+1),weight:1-tx}];
  }
  contact(){let x=0,y=0,z=0;for(const a of this.weights){const p=this.nodes[a.index];x+=p.x*a.weight;y+=p.y*a.weight;z+=p.z*a.weight;}return {x,y,z};}
  release(){this.target=null;this.grab=null;this.gustValue=null;this.weights=[];}
  gust(x:number,z:number){this.target=null;this.grab=null;this.weights=[];this.gustValue={x:clamp(x,-.65,.65),z:clamp(z,0,.7)};this.initialized=true;}

  step(elapsed:number){
    if(!Number.isFinite(elapsed)||elapsed<=0)return;const dt=Math.min(elapsed,10);
    if(this.target){advance(this.anchorU,this.target.u,18,1,dt);advance(this.anchorV,this.target.v,18,1,dt);}
    const gy=clamp(this.anchorV.value,1.5/this.rows,.995)*this.height,length=Math.min(320,gy);
    const targetLift=this.target?clamp(this.target.z,0,300):this.gustValue?this.gustValue.z*100:0;
    const targetPull=this.target?clamp(this.target.y-this.target.v*this.height,-length*.92,length*.6):0;
    const targetSide=this.target?clamp(this.target.x-this.target.u*this.width,-180,180):this.gustValue?this.gustValue.x*55:0;
    const held=!!this.target||!!this.gustValue;
    for(const [s,target] of [[this.lift,targetLift],[this.pull,targetPull],[this.side,targetSide]] as [Spring,number][])advance(s,target,held?18:2.5,held?1:.98,dt);
    if(this.lift.value<0){this.lift.value=0;this.lift.velocity=Math.abs(this.lift.velocity)*.1;}
    this.lift.value=Math.min(this.lift.value,330);this.pull.value=clamp(this.pull.value,-length*.95,length*.65);this.side.value=clamp(this.side.value,-200,200);
    this.rebuild(dt,gy,length);
    if(this.grab)Object.assign(this.grab,this.contact());
  }
  private rebuild(dt:number,gripY:number,length:number){
    const gripX=this.anchorU.value*this.width,start=gripY-length,tail=this.height-gripY;
    const maxAngle=1.42+.92*smooth(1-tail/240),lift=this.lift.value;
    const y=Math.max(length*.12,length+this.pull.value),ratio=Math.min(1,Math.hypot(y,lift)/Math.max(length,.001));
    let turn=Math.min(maxAngle,Math.atan2(lift,y));
    let low=0,high=Math.max(0,Math.min(turn,maxAngle-turn));
    for(let i=0;i<12;i++){const d=(low+high)/2,r=.7*Math.cos(d)+.3*(d<1e-5?1:Math.sin(d)/d);if(r>ratio)low=d;else high=d;}
    let curve=(low+high)/2;turn=Math.min(maxAngle,turn+.055*Math.max(0,turn-curve));curve=Math.min(curve,turn,maxAngle-turn);
    const old=new Float64Array(this.nodes.length*3);for(let i=0;i<this.nodes.length;i++){const p=this.nodes[i];old.set([p.x,p.y,p.z],i*3);}
    let maxZ=0;
    for(let column=0;column<=this.columns;column++){
      const rx=column*this.width/this.columns,weight=Math.exp(-Math.pow((rx-gripX)/(this.width*.36),2));let py=0,pz=0;
      for(let row=0;row<=this.rows;row++){
        if(row){const ds=this.height/this.rows/4;for(let sub=0;sub<4;sub++){const ry=(row-1)*this.height/this.rows+(sub+.5)*ds,t=(ry-start)/Math.max(length,.001);const angle=weight*((turn-curve)*smooth(t/.12)+2*curve*smooth((t-.32)/.36));py+=Math.cos(angle)*ds;pz+=Math.sin(angle)*ds;}}
        const p=this.nodes[this.index(column,row)];p.x=rx;p.y=py;p.z=Math.max(0,pz);maxZ=Math.max(maxZ,p.z);
      }
    }
    const depthScale=Math.min(1,290/Math.max(1,maxZ)),shear=clamp(this.side.value/Math.max(24,lift),-Math.min(.85,110/Math.max(1,maxZ)),Math.min(.85,110/Math.max(1,maxZ)));
    for(let i=0;i<this.nodes.length;i++){const p=this.nodes[i];p.x+=shear*p.z;p.z*=depthScale;if(p.fixed){p.x=p.rx;p.y=p.ry;p.z=0;}p.vx=(p.x-old[i*3])/Math.max(.001,dt*60);p.vy=(p.y-old[i*3+1])/Math.max(.001,dt*60);p.vz=(p.z-old[i*3+2])/Math.max(.001,dt*60);}
  }
  get settled(){return !this.grab&&!this.gustValue&&this.nodes.every(p=>Math.hypot(p.x-p.rx,p.y-p.ry,p.z)<.8&&Math.hypot(p.vx,p.vy,p.vz)<.05);}
}
