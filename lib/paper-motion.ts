import { PaperCloth, type ClothContact } from "./paper-cloth-physics";
import { PaperClothRenderer } from "./paper-cloth-renderer";
import { paperTexture } from "./paper-texture";
const reduced=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const controls="button,input,textarea,a,[contenteditable=true],.paper-drag-handle,.tape";
const simulations=new WeakMap<HTMLElement,FlexiblePaper>();
const live=new Set<FlexiblePaper>();
const pendingGust=new WeakMap<HTMLElement,{active:boolean;vx:number;vy:number}>();

class FlexiblePaper{
  readonly cloth:PaperCloth;
  readonly renderer:PaperClothRenderer;
  private frame=0;
  private previous=0;
  private releasedAt=performance.now();
  private dead=false;
  private peelTimer:ReturnType<typeof setTimeout>|null=null;
  constructor(readonly paper:HTMLElement,texture:HTMLCanvasElement){
    const coarse=window.matchMedia("(pointer:coarse)").matches;
    this.cloth=new PaperCloth(paper.offsetWidth,paper.offsetHeight,coarse?12:16,clamp(Math.ceil(paper.offsetHeight/19),18,36));
    this.renderer=new PaperClothRenderer(paper,this.cloth,texture,()=>this.destroy());
    simulations.set(paper,this);live.add(this);this.renderer.draw();this.wake();
  }
  hold(contact:ClothContact){if(this.peelTimer){clearTimeout(this.peelTimer);this.peelTimer=null;}this.cloth.hold(contact);this.cloth.step(1/120);this.renderer.draw();this.wake();}
  peel(){this.hold({u:.89,v:.94,x:this.cloth.width*.89+18,y:this.cloth.height*.55,z:Math.min(190,this.cloth.height*.42)});this.peelTimer=setTimeout(()=>{this.peelTimer=null;this.release();},950);}
  gust(vx:number,vy:number){this.cloth.gust(-vx*.2,.12+Math.abs(vx)*.12+Math.abs(vy)*.08);this.releasedAt=performance.now();this.wake();}
  release(){if(this.peelTimer){clearTimeout(this.peelTimer);this.peelTimer=null;}this.cloth.release();this.releasedAt=performance.now();this.wake();}
  private wake(){if(!this.frame&&!this.dead){this.previous=performance.now();this.frame=requestAnimationFrame(this.tick);}}
  private tick=(time:number)=>{
    this.frame=0;if(this.dead||!this.paper.isConnected||reduced()){this.destroy();return;}
    const dt=Math.min(1/30,(time-this.previous)/1000);this.previous=time;
    this.cloth.step(dt*.5);this.cloth.step(dt*.5);this.renderer.draw();
    if(!this.cloth.grab&&((this.cloth.settled&&time-this.releasedAt>600)||time-this.releasedAt>6500)){this.destroy();return;}
    this.frame=requestAnimationFrame(this.tick);
  };
  destroy(){if(this.dead)return;this.dead=true;if(this.peelTimer)clearTimeout(this.peelTimer);cancelAnimationFrame(this.frame);this.frame=0;this.renderer.destroy();simulations.delete(this.paper);live.delete(this);}
}
async function simulation(paper:HTMLElement,valid:()=>boolean=()=>true){
  if(reduced()||!paper.isConnected)return null;
  const existing=simulations.get(paper);if(existing)return existing;
  try{
    const texture=await paperTexture(paper);
    if(!valid()||!paper.isConnected||reduced()||paper.classList.contains("paper-writing"))return null;
    const current=simulations.get(paper);if(current)return current;
    if(live.size>=2)[...live][0]?.destroy();
    return new FlexiblePaper(paper,texture);
  }catch(error){console.warn("Paper deformation unavailable; keeping the editable paper.",error);return null;}
}
export function releasePaper(paper:HTMLElement){const gust=pendingGust.get(paper);if(gust)gust.active=false;simulations.get(paper)?.release();}
export function peelPaper(paper:HTMLElement){if(!reduced())void simulation(paper).then(sim=>sim?.peel());}
export function dragPaperMotion(paper:HTMLElement,vx:number,vy:number){
  const intent={active:true,vx,vy};pendingGust.set(paper,intent);
  const current=simulations.get(paper);if(current){current.gust(vx,vy);return;}
  void simulation(paper,()=>!!pendingGust.get(paper)?.active).then(sim=>{const latest=pendingGust.get(paper);if(sim&&latest?.active)sim.gust(latest.vx,latest.vy);});
}

export function installPaperMotion(root:HTMLElement):()=>void{
  type Press={paper:HTMLElement;id:number;u:number;v:number;localX:number;localY:number;depth:number;clientX:number;clientY:number;lastX:number;lastY:number;scale:number;cos:number;sin:number;sim:FlexiblePaper|null};
  let pressed:Press|null=null;
  const paperOf=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>(".wall-plane > .paper"):null;
  function apply(contact:Press){
    if(!contact.sim)return;
    const sx=(contact.lastX-contact.clientX)/contact.scale,sy=(contact.lastY-contact.clientY)/contact.scale;
    const dx=sx*contact.cos+sy*contact.sin,dy=-sx*contact.sin+sy*contact.cos,distance=Math.hypot(dx,dy);
    const z=Math.min(280,contact.depth+22+distance*1.12),perspective=1-z/1000,ox=contact.sim.cloth.width/2,oy=contact.sim.cloth.height*.25;
    contact.sim.hold({u:contact.u,v:contact.v,x:ox+(contact.localX+dx-ox)*perspective,y:oy+(contact.localY+dy-oy)*perspective,z});
  }
  function move(event:PointerEvent){if(!pressed||pressed.id!==event.pointerId)return;pressed.lastX=event.clientX;pressed.lastY=event.clientY;apply(pressed);if(Math.hypot(event.clientX-pressed.clientX,event.clientY-pressed.clientY)>5)event.preventDefault();}
  function down(event:PointerEvent){
    if(reduced()||event.button!==0||!(event.target instanceof Element)||event.target.closest(controls))return;
    const paper=paperOf(event.target);if(!paper||paper.classList.contains("paper-writing"))return;
    const rect=paper.getBoundingClientRect(),matrix=new DOMMatrix(getComputedStyle(paper).transform),scale=rect.width/(Math.abs(matrix.a)*paper.offsetWidth+Math.abs(matrix.c)*paper.offsetHeight);
    const cos=matrix.a,sin=matrix.b,x=(event.clientX-rect.left-rect.width/2)/scale,y=(event.clientY-rect.top-rect.height/2)/scale;
    const localX=clamp(paper.offsetWidth/2+x*cos+y*sin,1,paper.offsetWidth-1),localY=clamp(paper.offsetHeight/2-x*sin+y*cos,36,paper.offsetHeight-1);
    const existing=simulations.get(paper)||null,picked=existing?.renderer.pick(localX,localY);
    const current:Press={paper,id:event.pointerId,u:picked?.u??localX/paper.offsetWidth,v:picked?.v??localY/paper.offsetHeight,localX,localY,depth:picked?.depth??0,clientX:event.clientX,clientY:event.clientY,lastX:event.clientX,lastY:event.clientY,scale,cos,sin,sim:existing};
    pressed=current;paper.setPointerCapture(event.pointerId);
    if(current.sim)apply(current);else void simulation(paper,()=>pressed===current).then(sim=>{if(pressed===current&&sim){current.sim=sim;apply(current);}});
  }
  function up(event:PointerEvent){if(!pressed||event.pointerId!==pressed.id)return;const current=pressed;pressed=null;current.sim?.release();if(current.paper.hasPointerCapture(current.id))current.paper.releasePointerCapture(current.id);}
  function second(event:PointerEvent){if(pressed&&event.pointerId!==pressed.id){const previous=pressed;pressed=null;previous.sim?.release();if(previous.paper.hasPointerCapture(previous.id))previous.paper.releasePointerCapture(previous.id);}}
  function focus(event:FocusEvent){const paper=paperOf(event.target);if(paper&&event.target instanceof Element&&event.target.matches("input,textarea,[contenteditable=true]")){simulations.get(paper)?.destroy();paper.classList.add("paper-writing");}}
  function blur(event:FocusEvent){paperOf(event.target)?.classList.remove("paper-writing");}
  function warm(event:PointerEvent){if(event.pointerType!=="mouse")return;const paper=paperOf(event.target);if(paper&&!simulations.has(paper))void paperTexture(paper).catch(()=>{});}
  root.addEventListener("pointerdown",down);root.addEventListener("pointermove",move);root.addEventListener("pointerover",warm);root.addEventListener("focusin",focus);root.addEventListener("focusout",blur);
  window.addEventListener("pointerdown",second,true);window.addEventListener("pointerup",up,true);window.addEventListener("pointercancel",up,true);
  return()=>{pressed=null;root.removeEventListener("pointerdown",down);root.removeEventListener("pointermove",move);root.removeEventListener("pointerover",warm);root.removeEventListener("focusin",focus);root.removeEventListener("focusout",blur);window.removeEventListener("pointerdown",second,true);window.removeEventListener("pointerup",up,true);window.removeEventListener("pointercancel",up,true);for(const sim of [...live])if(root.contains(sim.paper))sim.destroy();};
}
