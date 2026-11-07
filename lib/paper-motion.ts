type Pose = { roll: number; fold: number; turn: number; lift: number };
const rest: Pose = { roll: 0, fold: 0, turn: 0, lift: 0 };
const limit = (value:number, maximum:number) => Math.max(-maximum, Math.min(maximum, value));
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const controls = "button,input,textarea,a,[contenteditable=true],.paper-drag-handle";

function cancelRelease(paper:HTMLElement) {
  for(const animation of paper.getAnimations()) if(animation.id==="paper-release") animation.cancel();
}
function pose(paper:HTMLElement, value:Pose) {
  paper.style.setProperty("--paper-roll",`${value.roll}deg`);
  paper.style.setProperty("--paper-fold",`${value.fold}deg`);
  paper.style.setProperty("--paper-turn",`${value.turn}deg`);
  paper.style.setProperty("--paper-lift",`${value.lift}px`);
}
function keyframe(value:Pose):Keyframe {
  return {"--paper-roll":`${value.roll}deg`, "--paper-fold":`${value.fold}deg`, "--paper-turn":`${value.turn}deg`, "--paper-lift":`${value.lift}px`};
}
export function releasePaper(paper:HTMLElement, gentle=false) {
  if(!paper.isConnected)return;
  const style=getComputedStyle(paper);
  const previous:Pose={roll:parseFloat(style.getPropertyValue("--paper-roll"))||0,fold:parseFloat(style.getPropertyValue("--paper-fold"))||0,turn:parseFloat(style.getPropertyValue("--paper-turn"))||0,lift:parseFloat(style.getPropertyValue("--paper-lift"))||0};
  cancelRelease(paper);
  paper.classList.remove("paper-touched");
  pose(paper,rest);
  if(reduced() || Object.values(previous).every(v=>Math.abs(v)<.1))return;
  const animation=paper.animate([
    {...keyframe(previous),offset:0},
    {...keyframe({roll:-previous.roll*.38,fold:-previous.fold*.3,turn:-previous.turn*.32,lift:2}),offset:.32},
    {...keyframe({roll:previous.roll*.16,fold:previous.fold*.12,turn:previous.turn*.1,lift:-1}),offset:.58},
    {...keyframe({roll:-previous.roll*.05,fold:-previous.fold*.035,turn:0,lift:.25}),offset:.8},
    {...keyframe(rest),offset:1},
  ],{duration:gentle?650:1100,easing:"ease-out"});
  animation.id="paper-release";
}
export function dragPaperMotion(paper:HTMLElement,velocityX:number,velocityY:number) {
  if(reduced())return;
  cancelRelease(paper);
  pose(paper,{roll:limit(-velocityX*3.2,6.5),fold:-9-Math.min(Math.abs(velocityY)*2,6),turn:limit(velocityX*1.8,5),lift:-10});
}

// Pointer movement changes DOM styles only. No React state updates, saved
// coordinates, or focus changes are involved in the decorative animation.
export function installPaperMotion(root:HTMLElement):()=>void {
  let hovered:HTMLElement|null=null;
  let pressed:{paper:HTMLElement;pointerId:number;startY:number}|null=null;
  let frame=0;
  let next:{paper:HTMLElement;value:Pose}|null=null;
  const getPaper=(target:EventTarget|null)=>(target instanceof Element?target.closest<HTMLElement>(".paper"):null);
  function queue(paper:HTMLElement,value:Pose) {
    next={paper,value};
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(next&&next.paper.isConnected)pose(next.paper,next.value);next=null;});
  }
  function move(event:PointerEvent) {
    if(reduced())return;
    const paper=pressed?.paper||getPaper(event.target);
    if(!paper || paper.classList.contains("is-dragging") || paper.classList.contains("paper-writing"))return;
    if(!pressed&&(event.pointerType!=="mouse" || (event.target as Element).closest(controls)))return;
    if(hovered&&hovered!==paper)releasePaper(hovered,true);
    hovered=paper;cancelRelease(paper);
    const rect=paper.getBoundingClientRect();
    const x=limit((event.clientX-rect.left)/rect.width-.5,.6);
    const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    const pull=pressed?Math.min(6,Math.abs(event.clientY-pressed.startY)/12):0;
    queue(paper,{roll:x*(pressed?4.5:2),fold:-(y*(pressed?12:6)+pull),turn:x*(pressed?13:7),lift:pressed?-3:-1});
  }
  function down(event:PointerEvent) {
    if(reduced() || event.button!==0 || (event.target as Element).closest(controls))return;
    const paper=getPaper(event.target);if(!paper)return;
    // Leave two-finger camera gestures to the wall's existing handlers.
    if(pressed){releasePaper(pressed.paper);pressed=null;return;}
    pressed={paper,pointerId:event.pointerId,startY:event.clientY};
    paper.classList.add("paper-touched");move(event);
  }
  function up(event:PointerEvent) {
    if(!pressed||pressed.pointerId!==event.pointerId)return;
    const paper=pressed.paper;pressed=null;
    if(frame){cancelAnimationFrame(frame);frame=0;next=null;}
    releasePaper(paper);
  }
  function secondPointer(event:PointerEvent) {
    if(!pressed||event.pointerId===pressed.pointerId)return;
    const paper=pressed.paper;pressed=null;
    if(frame){cancelAnimationFrame(frame);frame=0;next=null;}
    releasePaper(paper);
  }
  function out(event:PointerEvent) {
    if(!hovered || pressed || hovered.contains(event.relatedTarget as Node|null))return;
    releasePaper(hovered,true);hovered=null;
  }
  function focus(event:FocusEvent) {
    const paper=getPaper(event.target);if(!paper)return;
    if(event.target instanceof Element&&event.target.matches("input,textarea,[contenteditable=true]")){
      cancelRelease(paper);pose(paper,rest);paper.classList.add("paper-writing");
    }
  }
  function blur(event:FocusEvent) {
    const paper=getPaper(event.target);if(!paper)return;
    if(event.relatedTarget instanceof Element&&paper.contains(event.relatedTarget)&&event.relatedTarget.matches("input,textarea,[contenteditable=true]"))return;
    paper.classList.remove("paper-writing");
  }
  root.addEventListener("pointermove",move);
  root.addEventListener("pointerdown",down);
  root.addEventListener("pointerout",out);
  root.addEventListener("focusin",focus);
  root.addEventListener("focusout",blur);
  window.addEventListener("pointerdown",secondPointer,true);
  window.addEventListener("pointerup",up,true);
  window.addEventListener("pointercancel",up,true);
  return()=>{if(frame)cancelAnimationFrame(frame);root.removeEventListener("pointermove",move);root.removeEventListener("pointerdown",down);root.removeEventListener("pointerout",out);root.removeEventListener("focusin",focus);root.removeEventListener("focusout",blur);window.removeEventListener("pointerdown",secondPointer,true);window.removeEventListener("pointerup",up,true);window.removeEventListener("pointercancel",up,true);for(const paper of root.querySelectorAll<HTMLElement>(".paper")){cancelRelease(paper);pose(paper,rest);paper.classList.remove("paper-writing","paper-touched");}};
}
