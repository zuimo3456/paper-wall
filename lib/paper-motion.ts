import { PaperRibbon, type RibbonGrab } from "./paper-flex-physics";

const reduced=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const controls="button,input,textarea,a,[contenteditable=true],.paper-drag-handle";
const simulations=new WeakMap<HTMLElement,FlexiblePaper>();
const live=new Set<FlexiblePaper>();

class FlexiblePaper {
  readonly ribbon:PaperRibbon;
  readonly width:number;
  readonly height:number;
  readonly layer:HTMLDivElement;
  private readonly strips:{body:HTMLDivElement;shade:HTMLDivElement;back:HTMLDivElement}[]=[];
  private readonly shadow:SVGSVGElement;
  private readonly shadowPath:SVGPathElement;
  private frame=0;
  private previous=0;
  private releasedAt=performance.now();
  private dead=false;
  private peelTimer:ReturnType<typeof setTimeout>|null=null;
  constructor(readonly paper:HTMLElement){
    this.width=paper.offsetWidth;this.height=paper.offsetHeight;
    const coarse=window.matchMedia("(pointer:coarse)").matches;
    this.ribbon=new PaperRibbon(this.height,clamp(Math.ceil(this.height/(coarse?18:12)),coarse?22:30,coarse?32:48));
    this.layer=document.createElement("div");this.layer.className="paper-flex";this.layer.setAttribute("aria-hidden","true");this.layer.inert=true;
    this.shadow=document.createElementNS("http://www.w3.org/2000/svg","svg");this.shadow.classList.add("paper-flex-shadow");
    this.shadow.setAttribute("width",String(this.width));this.shadow.setAttribute("height",String(this.height));
    this.shadowPath=document.createElementNS("http://www.w3.org/2000/svg","path");this.shadowPath.setAttribute("fill","#343526");this.shadow.appendChild(this.shadowPath);this.layer.appendChild(this.shadow);
    const background=getComputedStyle(paper).backgroundColor;
    for(let i=0;i<this.ribbon.count;i++){
      const strip=document.createElement("div");strip.className="paper-flex-strip";strip.style.width=`${this.width}px`;strip.style.height=`${this.ribbon.length+1}px`;
      const front=document.createElement("div");front.className="paper-flex-front";
      const copy=paper.cloneNode(true) as HTMLElement;
      copy.classList.remove("is-dragging","is-front","is-flexing","paper-writing");copy.classList.add("paper-flex-copy");copy.removeAttribute("aria-label");copy.setAttribute("aria-hidden","true");copy.inert=true;
      copy.style.width=`${this.width}px`;copy.style.height=`${this.height}px`;copy.style.top=`${-i*this.ribbon.length}px`;
      for(const node of copy.querySelectorAll(".tape,.paper-curl,.paper-flex"))node.remove();
      for(const node of copy.querySelectorAll("[id]"))node.removeAttribute("id");
      front.appendChild(copy);
      const shade=document.createElement("div");shade.className="paper-flex-shade";front.appendChild(shade);
      const back=document.createElement("div");back.className="paper-flex-back";back.style.backgroundColor=background;
      strip.appendChild(front);strip.appendChild(back);this.layer.appendChild(strip);this.strips.push({body:strip,shade,back});
    }
    paper.classList.add("is-flexing");paper.appendChild(this.layer);
    simulations.set(paper,this);live.add(this);this.draw();this.wake();
  }
  hold(target:RibbonGrab){if(this.peelTimer){clearTimeout(this.peelTimer);this.peelTimer=null;}this.ribbon.hold(target);this.ribbon.step(1/120);this.draw();this.wake();}
  peel(){
    this.hold({index:this.ribbon.count-2,x:this.width*.1,y:this.height*.57,z:Math.min(180,this.height*.39),twist:15});
    this.peelTimer=setTimeout(()=>{this.peelTimer=null;this.release();},1000);
  }
  gust(vx:number,vy:number){this.ribbon.gust(-vx*.22,.16+Math.abs(vx)*.16+Math.abs(vy)*.09);this.releasedAt=performance.now();this.wake();}
  release(){if(this.peelTimer){clearTimeout(this.peelTimer);this.peelTimer=null;}this.ribbon.release();this.releasedAt=performance.now();this.wake();}
  private wake(){if(!this.frame&&!this.dead){this.previous=performance.now();this.frame=requestAnimationFrame(this.tick);}}
  private tick=(time:number)=>{
    this.frame=0;if(this.dead||!this.paper.isConnected||reduced()){this.destroy();return;}
    const dt=Math.min(1/30,(time-this.previous)/1000);this.previous=time;
    // Two substeps keep the constraint solver stable on slower mobile frames.
    this.ribbon.step(dt*.5);this.ribbon.step(dt*.5);this.draw();
    if(!this.ribbon.grab&&((this.ribbon.settled&&time-this.releasedAt>600)||time-this.releasedAt>8000)){this.destroy();return;}
    this.frame=requestAnimationFrame(this.tick);
  };
  private draw(){
    const points=this.ribbon.points,half=this.width/2,left:string[]=[],right:string[]=[];
    const edges:{left:{x:number;y:number};right:{x:number;y:number};z:number}[]=[];
    let totalZ=0;
    for(let i=0;i<=this.ribbon.count;i++){
      const p=points[i],t=i/this.ribbon.count,twist=this.ribbon.twist*Math.pow(t,1.5)*Math.PI/180;
      const edge=half*Math.cos(twist),edgeZ=half*Math.sin(twist);
      const lx=half+p.x-edge-(p.z+edgeZ)*.46,ly=p.y+(p.z+edgeZ)*.24;
      const rx=half+p.x+edge-(p.z-edgeZ)*.46,ry=p.y+(p.z-edgeZ)*.24;
      left.push(`${lx.toFixed(1)},${ly.toFixed(1)}`);right.push(`${rx.toFixed(1)},${ry.toFixed(1)}`);totalZ+=p.z;
      const project=(x:number,y:number,z:number)=>{const scale=1000/(1000-z);return {x:half+(x-half)*scale,y:this.height*.25+(y-this.height*.25)*scale};};
      edges.push({left:project(half+p.x-edge,p.y,p.z+edgeZ),right:project(half+p.x+edge,p.y,p.z-edgeZ),z:p.z});
      if(i===this.ribbon.count)continue;
      const next=points[i+1],dy=next.y-p.y,dz=next.z-p.z;
      const fold=Math.atan2(dz,dy)*180/Math.PI;
      const strip=this.strips[i];
      const normal=Math.cos(fold*Math.PI/180),shade=clamp(.025+(1-normal)*.14+Math.sin(fold*Math.PI/180)*.09,0,.39);
      strip.shade.style.background=`linear-gradient(90deg,rgba(53,49,29,${(shade*.65).toFixed(3)}),rgba(255,255,241,${clamp(-shade+.08,0,.13).toFixed(3)}) 43%,rgba(53,49,29,${shade.toFixed(3)}))`;
      strip.back.style.filter=`brightness(${(.95-Math.abs(Math.sin(fold*Math.PI/180))*.12).toFixed(3)})`;
    }
    // Adjacent patches share exactly the same projected edge. Mapping their
    // four corners avoids the gaps produced by rotating independent slats.
    for(let i=0;i<this.ribbon.count;i++){
      const a=edges[i].left,b=edges[i].right,c=edges[i+1].right,d=edges[i+1].left;
      const dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
      const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
      const divisor=dx1*dy2-dx2*dy1;
      let g=0,h=0;if(Math.abs(divisor)>.00001){g=(dx3*dy2-dx2*dy3)/divisor;h=(dx1*dy3-dx3*dy1)/divisor;}
      const w=this.width,l=this.ribbon.length,z=(edges[i].z+edges[i+1].z)*.5;
      const m=[(b.x-a.x+g*b.x)/w,(b.y-a.y+g*b.y)/w,z*g/w,g/w,(d.x-a.x+h*d.x)/l,(d.y-a.y+h*d.y)/l,z*h/l,h/l,0,0,1,0,a.x,a.y,z,1];
      const strip=this.strips[i];strip.body.style.transform=`matrix3d(${m.map(n=>n.toFixed(7)).join(",")})`;
      const front=(b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x)>=0;
      strip.shade.parentElement!.style.display=front?"block":"none";strip.back.style.display=front?"none":"block";
    }
    this.shadowPath.setAttribute("d",`M${left.join(" L")} L${right.reverse().join(" L")} Z`);
    const height=totalZ/points.length;this.shadow.style.filter=`blur(${(3+height*.055).toFixed(1)}px)`;this.shadow.style.opacity=String(clamp(.21-height*.00045,.11,.21));
    this.paper.dataset.flexDepth=String(Math.round(Math.max(...points.map(p=>p.z))));
  }
  destroy(){
    if(this.dead)return;this.dead=true;if(this.peelTimer)clearTimeout(this.peelTimer);cancelAnimationFrame(this.frame);this.frame=0;this.layer.remove();this.paper.classList.remove("is-flexing");delete this.paper.dataset.flexDepth;simulations.delete(this.paper);live.delete(this);
  }
}
function simulation(paper:HTMLElement){return simulations.get(paper)||new FlexiblePaper(paper);}
export function releasePaper(paper:HTMLElement){simulations.get(paper)?.release();}
export function peelPaper(paper:HTMLElement){if(!reduced())simulation(paper).peel();}
export function dragPaperMotion(paper:HTMLElement,velocityX:number,velocityY:number){if(!reduced())simulation(paper).gust(velocityX,velocityY);}

export function installPaperMotion(root:HTMLElement):()=>void{
  let pressed:{paper:HTMLElement;id:number;clientX:number;clientY:number;localX:number;localY:number;scale:number;sim:FlexiblePaper}|null=null;
  const paperOf=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>(".wall-plane > .paper"):null;
  function move(event:PointerEvent){
    if(!pressed||event.pointerId!==pressed.id)return;
    const {sim,localX,localY,scale,clientX,clientY}=pressed;
    const dx=(event.clientX-clientX)/scale,dy=(event.clientY-clientY)/scale,distance=Math.hypot(dx,dy);
    sim.hold({index:Math.round(localY/sim.ribbon.length),x:clamp(dx*.8,-sim.width*.8,sim.width*.8),y:localY+dy*.84-5,z:Math.min(240,30+distance*1.2),twist:clamp((localX/sim.width-.5)*(distance*.25+7),-24,24)});
    if(distance>5)event.preventDefault();
  }
  function down(event:PointerEvent){
    if(reduced()||event.button!==0||!(event.target instanceof Element)||event.target.closest(controls))return;
    const paper=paperOf(event.target);if(!paper||paper.classList.contains("paper-writing"))return;
    const rect=paper.getBoundingClientRect(),scale=rect.width/paper.offsetWidth,localY=clamp((event.clientY-rect.top)/scale,36,paper.offsetHeight-2);
    const sim=simulation(paper);
    pressed={paper,id:event.pointerId,clientX:event.clientX,clientY:event.clientY,localX:(event.clientX-rect.left)/scale,localY,scale,sim};
    paper.setPointerCapture(event.pointerId);move(event);
  }
  function up(event:PointerEvent){if(!pressed||event.pointerId!==pressed.id)return;const {paper,sim}=pressed;pressed=null;sim.release();if(paper.hasPointerCapture(event.pointerId))paper.releasePointerCapture(event.pointerId);}
  function second(event:PointerEvent){if(pressed&&event.pointerId!==pressed.id){const previous=pressed;pressed=null;previous.sim.release();if(previous.paper.hasPointerCapture(previous.id))previous.paper.releasePointerCapture(previous.id);}}
  function focus(event:FocusEvent){const paper=paperOf(event.target);if(paper&&event.target instanceof Element&&event.target.matches("input,textarea,[contenteditable=true]")){simulations.get(paper)?.destroy();paper.classList.add("paper-writing");}}
  function blur(event:FocusEvent){paperOf(event.target)?.classList.remove("paper-writing");}
  root.addEventListener("pointerdown",down);root.addEventListener("pointermove",move);root.addEventListener("focusin",focus);root.addEventListener("focusout",blur);
  window.addEventListener("pointerdown",second,true);window.addEventListener("pointerup",up,true);window.addEventListener("pointercancel",up,true);
  return()=>{root.removeEventListener("pointerdown",down);root.removeEventListener("pointermove",move);root.removeEventListener("focusin",focus);root.removeEventListener("focusout",blur);window.removeEventListener("pointerdown",second,true);window.removeEventListener("pointerup",up,true);window.removeEventListener("pointercancel",up,true);for(const sim of [...live])if(root.contains(sim.paper))sim.destroy();};
}
