import { PaperCloth, type ClothContact } from "./paper-cloth-physics";
import { PaperClothRenderer } from "./paper-cloth-renderer";
import { paperTexture, type PaperTexture } from "./paper-texture";
const reduced=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const controls="button:not(.paper-curl):not(.todo-content),input,textarea,a,[contenteditable=true],.paper-drag-handle,.tape";
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
  constructor(readonly paper:HTMLElement,texture:PaperTexture){
    const coarse=window.matchMedia("(pointer:coarse)").matches;
    this.cloth=new PaperCloth(paper.offsetWidth,paper.offsetHeight,coarse?12:16,clamp(Math.ceil(paper.offsetHeight/19),18,36));
    this.renderer=new PaperClothRenderer(paper,this.cloth,texture,()=>this.destroy());
    simulations.set(paper,this);live.add(this);this.renderer.draw();this.wake();
  }
  hold(contact:ClothContact){if(this.peelTimer){clearTimeout(this.peelTimer);this.peelTimer=null;}this.cloth.hold(contact);this.wake();}
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
  type Press={paper:HTMLElement;id:number;u:number;v:number;localX:number;localY:number;depth:number;clientX:number;clientY:number;lastX:number;lastY:number;scale:number;cos:number;sin:number;sim:FlexiblePaper|null;deferred:boolean};
  let pressed:Press|null=null;
  let suppressClickUntil=0;
  const host=root.parentElement||root;
  const paperOf=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>(".wall-plane > .paper"):null;
  function localPoint(paper:HTMLElement,clientX:number,clientY:number){
    const rect=paper.getBoundingClientRect(),matrix=new DOMMatrix(getComputedStyle(paper).transform),scale=rect.width/(Math.abs(matrix.a)*paper.offsetWidth+Math.abs(matrix.c)*paper.offsetHeight);
    const cos=matrix.a,sin=matrix.b,x=(clientX-rect.left-rect.width/2)/scale,y=(clientY-rect.top-rect.height/2)/scale;
    return {scale,cos,sin,x:paper.offsetWidth/2+x*cos+y*sin,y:paper.offsetHeight/2-x*sin+y*cos};
  }
  function apply(contact:Press){
    if(!contact.sim)return;
    const sx=(contact.lastX-contact.clientX)/contact.scale,sy=(contact.lastY-contact.clientY)/contact.scale;
    const dx=sx*contact.cos+sy*contact.sin,dy=-sx*contact.sin+sy*contact.cos,distance=Math.hypot(dx,dy);
    const z=Math.min(280,contact.depth+22+distance*1.12),perspective=1-z/1000,ox=contact.sim.cloth.width/2,oy=contact.sim.cloth.height*.25;
    contact.sim.hold({u:contact.u,v:contact.v,x:ox+(contact.localX+dx-ox)*perspective,y:oy+(contact.localY+dy-oy)*perspective,z});
  }
  function begin(current:Press){current.deferred=false;current.paper.setPointerCapture(current.id);if(current.sim)apply(current);else void simulation(current.paper,()=>pressed===current).then(sim=>{if(pressed===current&&sim){current.sim=sim;apply(current);}});}
  function move(event:PointerEvent){if(!pressed||pressed.id!==event.pointerId)return;if(event.buttons===0){cancel();return;}pressed.lastX=event.clientX;pressed.lastY=event.clientY;const distance=Math.hypot(event.clientX-pressed.clientX,event.clientY-pressed.clientY);if(pressed.deferred&&distance>5)begin(pressed);if(!pressed.deferred)apply(pressed);if(distance>5){suppressClickUntil=performance.now()+400;event.preventDefault();}}
  function down(event:PointerEvent){
    if(reduced()||event.button!==0||!(event.target instanceof Element)||event.target.closest(controls))return;
    let paper=paperOf(event.target);
    // Lifted corners can project outside the original DOM rectangle. Pick the
    // actual visible mesh there instead of treating that pixel as bare wall.
    if(!paper){paper=[...live].reverse().find(sim=>{if(!root.contains(sim.paper))return false;const p=localPoint(sim.paper,event.clientX,event.clientY);return !!sim.renderer.pick(p.x,p.y);})?.paper||null;}
    if(!paper)return;
    if(paper.classList.contains("paper-writing")){
      const active=document.activeElement;if(active instanceof HTMLElement&&paper.contains(active))active.blur();
      paper.classList.remove("paper-writing");
    }
    const p=localPoint(paper,event.clientX,event.clientY),{scale,cos,sin}=p;
    const localX=p.x,localY=p.y;
    const existing=simulations.get(paper)||null,picked=existing?.renderer.pick(localX,localY);
    const current:Press={paper,id:event.pointerId,u:picked?.u??localX/paper.offsetWidth,v:picked?.v??localY/paper.offsetHeight,localX,localY,depth:picked?.depth??0,clientX:event.clientX,clientY:event.clientY,lastX:event.clientX,lastY:event.clientY,scale,cos,sin,sim:existing,deferred:!!event.target.closest("button")};
    pressed=current;event.stopPropagation();
    // A click still edits a todo or peels a corner. Only capture a button's
    // pointer once it actually becomes a drag; otherwise capture retargets the
    // subsequent click to the section and silently breaks those controls.
    if(!current.deferred){event.preventDefault();begin(current);}
  }
  function up(event:PointerEvent){if(!pressed||event.pointerId!==pressed.id)return;const current=pressed;pressed=null;current.sim?.release();if(current.paper.hasPointerCapture(current.id))current.paper.releasePointerCapture(current.id);}
  function cancel(){if(!pressed)return;const current=pressed;pressed=null;current.sim?.release();if(current.paper.hasPointerCapture(current.id))current.paper.releasePointerCapture(current.id);}
  function lost(event:PointerEvent){if(pressed&&event.pointerId===pressed.id)cancel();}
  function hidden(){if(document.hidden)cancel();}
  function drag(event:DragEvent){if(paperOf(event.target)){event.preventDefault();cancel();}}
  function click(event:MouseEvent){if(paperOf(event.target)&&performance.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();}}
  function second(event:PointerEvent){if(pressed&&event.pointerId!==pressed.id){const previous=pressed;pressed=null;previous.sim?.release();if(previous.paper.hasPointerCapture(previous.id))previous.paper.releasePointerCapture(previous.id);}}
  function focus(event:FocusEvent){const paper=paperOf(event.target);if(paper&&event.target instanceof Element&&event.target.matches("input,textarea,[contenteditable=true]")){simulations.get(paper)?.destroy();paper.classList.add("paper-writing");}}
  function blur(event:FocusEvent){paperOf(event.target)?.classList.remove("paper-writing");}
  function warm(event:PointerEvent){if(event.pointerType!=="mouse")return;const paper=paperOf(event.target);if(paper&&!simulations.has(paper))void paperTexture(paper).catch(()=>{});}
  host.addEventListener("pointerdown",down);host.addEventListener("pointerover",warm);host.addEventListener("dragstart",drag);host.addEventListener("click",click,true);host.addEventListener("lostpointercapture",lost);root.addEventListener("focusin",focus);root.addEventListener("focusout",blur);
  window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerdown",second,true);window.addEventListener("pointerup",up,true);window.addEventListener("pointercancel",up,true);window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",hidden);
  return()=>{cancel();host.removeEventListener("pointerdown",down);host.removeEventListener("pointerover",warm);host.removeEventListener("dragstart",drag);host.removeEventListener("click",click,true);host.removeEventListener("lostpointercapture",lost);root.removeEventListener("focusin",focus);root.removeEventListener("focusout",blur);window.removeEventListener("pointermove",move);window.removeEventListener("pointerdown",second,true);window.removeEventListener("pointerup",up,true);window.removeEventListener("pointercancel",up,true);window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",hidden);for(const sim of [...live])if(root.contains(sim.paper))sim.destroy();};
}
