export type PaperTexture={paper:HTMLCanvasElement;tape:HTMLCanvasElement|null};
type TextureEntry={stamp:string;promise:Promise<PaperTexture>};
const cache=new WeakMap<HTMLElement,TextureEntry>();
const properties=`display position top right bottom left width height min-width min-height max-width max-height box-sizing margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius background-color background-image background-size background-position background-repeat background-origin background-clip color opacity font-family font-size font-weight font-style font-variant line-height letter-spacing text-align text-transform text-decoration white-space overflow overflow-x overflow-y text-overflow overflow-wrap word-break vertical-align flex-direction flex-wrap flex-grow flex-shrink flex-basis justify-content align-items align-content align-self gap row-gap column-gap order list-style-type list-style-position list-style-image transform transform-origin z-index box-shadow text-shadow filter clip-path fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset fill-rule`.split(" ");
function stamp(paper:HTMLElement){return `${paper.offsetWidth}:${paper.offsetHeight}:${getComputedStyle(paper).getPropertyValue("--paper")}:`+Array.from(paper.children).filter(el=>!el.classList.contains("paper-flex")).map(el=>el.outerHTML).join("")+Array.from(paper.querySelectorAll("input,textarea")).map(el=>(el as HTMLInputElement).value).join("|");}
function copyStyles(from:CSSStyleDeclaration,to:CSSStyleDeclaration){for(const property of properties)to.setProperty(property,from.getPropertyValue(property));to.setProperty("animation","none");to.setProperty("transition","none");}

// Rasterize the styled element at its own origin. This preserves browser-native
// glyphs, CSS grain and clipped tape instead of reconstructing those materials.
async function nativeSnapshot(source:HTMLElement,width:number,height:number,scale:number){
  const clone=source.cloneNode(true) as HTMLElement;
  const originals=[source,...source.querySelectorAll<HTMLElement|SVGElement>("*")],copies=[clone,...clone.querySelectorAll<HTMLElement|SVGElement>("*")];
  for(let i=0;i<originals.length;i++){
    const original=originals[i],copy=copies[i];copyStyles(getComputedStyle(original),copy.style);
    if(original instanceof HTMLInputElement){copy.setAttribute("value",original.value);if(original.checked)copy.setAttribute("checked","");}
    if(original instanceof HTMLTextAreaElement)copy.textContent=original.value;
    for(const pseudo of ["::before","::after"]){
      if(i===0&&source.classList.contains("paper"))continue;
      const style=getComputedStyle(original,pseudo);if(!style.content||style.content==="none"||style.content==="normal"||style.display==="none")continue;
      const element=document.createElement("span");copyStyles(style,element.style);element.textContent=style.content.replace(/^['"]|['"]$/g,"");element.setAttribute("aria-hidden","true");
      if(pseudo==="::before")copy.insertBefore(element,copy.firstChild);else copy.appendChild(element);
    }
  }
  Object.assign(clone.style,{position:"relative",left:"0",top:"0",right:"auto",bottom:"auto",margin:"0",transform:"none",width:`${width}px`,height:`${height}px`,boxShadow:"none"});
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("width",String(width));svg.setAttribute("height",String(height));svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
  const object=document.createElementNS(svg.namespaceURI,"foreignObject");object.setAttribute("x","0");object.setAttribute("y","0");object.setAttribute("width","100%");object.setAttribute("height","100%");object.appendChild(clone);svg.appendChild(object);
  const image=new Image();const url="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(new XMLSerializer().serializeToString(svg));
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Native paper snapshot unavailable"));image.src=url;});
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  const ctx=canvas.getContext("2d")!;ctx.drawImage(image,0,0,canvas.width,canvas.height);
  if(source.classList.contains("paper")&&ctx.getImageData(Math.min(8,canvas.width-1),Math.min(8,canvas.height-1),1,1).data[3]<100)throw new Error("Empty paper snapshot");
  return canvas;
}

export function paperTexture(paper:HTMLElement):Promise<PaperTexture>{
  const key=stamp(paper),entry=cache.get(paper);if(entry?.stamp===key)return entry.promise;
  const promise=(async()=>{
    await document.fonts.ready;
    const container=document.createElement("div");container.className="paper-texture-staging";container.setAttribute("aria-hidden","true");container.inert=true;
    Object.assign(container.style,{position:"fixed",left:"-12000px",top:"0",width:`${paper.offsetWidth}px`,height:`${paper.offsetHeight}px`,pointerEvents:"none"});
    const source=paper.cloneNode(true) as HTMLElement;source.classList.remove("is-flexing","is-dragging","paper-writing","is-front");source.classList.add("paper-texture-source");source.removeAttribute("aria-label");source.inert=true;
    Object.assign(source.style,{position:"relative",left:"0",top:"0",margin:"0",width:`${paper.offsetWidth}px`,height:`${paper.offsetHeight}px`});
    for(const node of source.querySelectorAll(".paper-flex"))node.remove();for(const node of source.querySelectorAll("[id]"))node.removeAttribute("id");
    container.appendChild(source);document.body.appendChild(container);
    const scale=Math.min(3,Math.max(2,window.devicePixelRatio||1),4000/paper.offsetHeight);
    try{
      const tape=source.querySelector<HTMLElement>(":scope > .tape");let tapeCanvas:HTMLCanvasElement|null=null;
      if(tape){tape.style.transform="none";tapeCanvas=await nativeSnapshot(tape,tape.offsetWidth,tape.offsetHeight,scale);tape.remove();}
      const canvas=await nativeSnapshot(source,paper.offsetWidth,paper.offsetHeight,scale);
      return {paper:canvas,tape:tapeCanvas};
    }finally{container.remove();}
  })();
  cache.set(paper,{stamp:key,promise});promise.catch(()=>{if(cache.get(paper)?.promise===promise)cache.delete(paper);});return promise;
}
