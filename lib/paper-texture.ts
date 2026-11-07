type TextureEntry={stamp:string;promise:Promise<HTMLCanvasElement>};
const cache=new WeakMap<HTMLElement,TextureEntry>();
let rasterizer:Promise<typeof import("html2canvas")>|null=null;
function stamp(paper:HTMLElement){return `${paper.offsetWidth}:${paper.offsetHeight}:${getComputedStyle(paper).getPropertyValue("--paper")}:`+Array.from(paper.children).filter(el=>!el.classList.contains("paper-flex")).map(el=>el.outerHTML).join("")+Array.from(paper.querySelectorAll("input,textarea")).map(el=>(el as HTMLInputElement).value).join("|");}

export function paperTexture(paper:HTMLElement):Promise<HTMLCanvasElement>{
  const key=stamp(paper),entry=cache.get(paper);if(entry?.stamp===key)return entry.promise;
  const promise=(async()=>{
    rasterizer??=import("html2canvas");const {default:rasterize}=await rasterizer;
    const container=document.createElement("div");container.className="paper-texture-staging";container.setAttribute("aria-hidden","true");container.inert=true;
    Object.assign(container.style,{position:"fixed",left:"-12000px",top:"0",width:`${paper.offsetWidth}px`,height:`${paper.offsetHeight}px`,pointerEvents:"none"});
    const source=paper.cloneNode(true) as HTMLElement;source.classList.remove("is-flexing","is-dragging","paper-writing","is-front");source.classList.add("paper-texture-source");source.removeAttribute("aria-label");source.inert=true;
    Object.assign(source.style,{position:"relative",left:"0",top:"0",margin:"0",width:`${paper.offsetWidth}px`,height:`${paper.offsetHeight}px`});
    for(const node of source.querySelectorAll(".tape,.paper-curl,.paper-flex"))node.remove();for(const node of source.querySelectorAll("[id]"))node.removeAttribute("id");
    container.appendChild(source);document.body.appendChild(container);
    try{return await rasterize(source,{width:paper.offsetWidth,height:paper.offsetHeight,scale:Math.min(1.8,window.devicePixelRatio||1.5,4000/paper.offsetHeight),backgroundColor:null,logging:false,imageTimeout:1500,scrollX:0,scrollY:0,removeContainer:true});}
    finally{container.remove();}
  })();
  cache.set(paper,{stamp:key,promise});promise.catch(()=>{if(cache.get(paper)?.promise===promise)cache.delete(paper);});return promise;
}
