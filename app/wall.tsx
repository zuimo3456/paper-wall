"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { withoutServerFields, RECENT_LAYOUT_ID, type SavedItem, type SavedContentItem, type WallLayout, type WallItem, type Paper, type Todo } from "../lib/wall-model";
import { installPaperMotion, dragPaperMotion, releasePaper, peelPaper } from "../lib/paper-motion";
import { newId } from "../lib/new-id";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {paperBounds,findEmptyPosition,type Bounds,type Position} from "../lib/paper-placement";
const ITEMS_URL=(import.meta.env.VITE_WALL_API_BASE||"").replace(/\/$/,"")+"/api/items";

type View = { x: number; y: number; scale: number };
type Editor = { mode: "todo" | "paper"; original?: SavedContentItem; at?: {x:number;y:number} };
type PaperItem = SavedItem & Paper;
type TodoItem = SavedItem & Todo;
type IconName = "plus" | "archive" | "close" | "minus" | "home" | "edit" | "undo" | "check" | "refresh" | "download" | "arrow" | "move";
const paths: Record<IconName,string> = {
  move:"M12 2v20M2 12h20m-7-7-3-3-3 3m6 14-3 3-3-3M5 9l-3 3 3 3m14-6 3 3-3 3",
  plus:"M12 5v14M5 12h14", archive:"M4 8h16v12H4zM3 4h18v4H3zM9 12h6", close:"m6 6 12 12M6 18 18 6", minus:"M5 12h14",
  home:"m3 11 9-8 9 8M6 10v10h12V10M10 20v-6h4v6",edit:"m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z",undo:"M4 9h10a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5",
  check:"m5 12 4 4L19 6", refresh:"M20 7v5h-5M4 17v-5h5M5.4 7a8 8 0 0 1 13-2L20 8M4 16l1.6 3a8 8 0 0 0 13-2",download:"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",arrow:"M12 4v15m-5-5 5 5 5-5",
};
function Icon({name,size=18}:{name:IconName;size?:number}) {return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;}
function IconButton({label,name,onClick,disabled,className=""}:{label:string;name:IconName;onClick:()=>void;disabled?:boolean;className?:string}) {return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon name={name}/></button>;}
const clamp = (n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const paperColors = [{id:"linen",label:"米白"},{id:"butter",label:"浅黄"},{id:"sage",label:"鼠尾草绿"},{id:"rose",label:"淡粉"}] as const;
const now = () => Date.now();
function today() {return new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",weekday:"long"}).format(new Date());}

export default function Wall() {
  const [items,setItems]=useState<SavedItem[]>([]);
  const itemsRef=useRef(items); itemsRef.current=items;
  const [loaded,setLoaded]=useState(false);
  const [sync,setSync]=useState<"loading"|"saved"|"error"|"saving">("loading");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState<{text:string;undo?:()=>void}|null>(null);
  const [pending,setPending]=useState<Set<string>>(new Set());
  const pendingRef=useRef(new Set<string>());
  const [editor,setEditor]=useState<Editor|null>(null);
  const editorRef=useRef(editor);editorRef.current=editor;
  const [archiveOpen,setArchiveOpen]=useState(false);
  const [quickTodo,setQuickTodo]=useState("");
  const [quickBusy,setQuickBusy]=useState(false);
  const quickBusyRef=useRef(false);
  const [date,setDate]=useState("");
  const [view,setView]=useState<View>({x:0,y:0,scale:1});
  const viewRef=useRef(view);viewRef.current=view;
  const viewport=useRef<HTMLDivElement>(null);
  const plane=useRef<HTMLDivElement>(null);
  const gesture=useRef<{id:string;startX:number;startY:number;origX:number;origY:number;element:HTMLElement;moved:boolean;dx:number;dy:number;lastX:number;lastY:number;lastTime:number}|null>(null);
  const points=useRef(new Map<number,{x:number;y:number}>());
  const pan=useRef<{view:View;point:{x:number;y:number};distance:number;count:number}|null>(null);
  const touchCamera=useRef(false);
  const suppressClickUntil=useRef(0);
  const [dragging,setDragging]=useState(false);
  const [wallPanMode,setWallPanMode]=useState(false);
  const [activePaper,setActivePaper]=useState<string|null>(null);
  const readSeq=useRef(0);
  const initialView=useRef(false);
  const placementQueue=useRef<Promise<void>>(Promise.resolve());
  useEffect(()=>{if(plane.current)return installPaperMotion(plane.current);},[]);

  const refresh=useCallback(async(quiet=false)=>{
    if(pendingRef.current.size || gesture.current) return;
    const seq=++readSeq.current;
    try {
      if(!quiet) setSync("loading");
      const response=await fetch(ITEMS_URL,{cache:"no-store"});
      const data=await response.json() as {items:SavedItem[];error?:string};
      if(!response.ok)throw new Error(data.error || "无法读取墙面");
      if(seq!==readSeq.current || pendingRef.current.size || gesture.current)return;
      itemsRef.current=data.items;setItems(data.items);setLoaded(true);setSync("saved");setError("");return data.items as SavedItem[];
    } catch(e) {setSync("error");setError(e instanceof Error?e.message:"无法连接，请重试");}
  },[]);

  useEffect(()=>{
    setDate(today());
    if(window.innerWidth<650){const scale=Math.min(.93,(window.innerWidth-40)/326);setView({x:20-56*scale,y:24-62*scale,scale});}
    void refresh();
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh(true);},7000);
    const onVisible=()=>{if(document.visibilityState==="visible")void refresh(true);};
    window.addEventListener("focus",onVisible);window.addEventListener("online",onVisible);document.addEventListener("visibilitychange",onVisible);
    return ()=>{clearInterval(timer);window.removeEventListener("focus",onVisible);window.removeEventListener("online",onVisible);document.removeEventListener("visibilitychange",onVisible);};
  },[refresh]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),6500);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{if(loaded&&!initialView.current){initialView.current=true;resetView();}},[loaded]);
  useEffect(()=>{
    const cancel=()=>{const g=gesture.current;if(g){gesture.current=null;g.element.classList.remove("is-dragging");g.element.style.left=`${g.origX}px`;g.element.style.top=`${g.origY}px`;releasePaper(g.element);}points.current.clear();pan.current=null;touchCamera.current=false;setDragging(false);};
    const hidden=()=>{if(document.hidden)cancel();};window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",hidden);
    return()=>{window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",hidden);};
  },[]);

  async function save(item:WallItem, revision?:number):Promise<SavedItem|null> {
    if(pendingRef.current.has(item.id))return null;
    ++readSeq.current;
    pendingRef.current.add(item.id);setPending(new Set(pendingRef.current));setSync("saving");setError("");
    let conflict=false;
    try {
      const previous=itemsRef.current.find(i=>i.id===item.id);
      const response=await fetch(ITEMS_URL,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({item,revision:revision ?? previous?.revision ?? 0})});
      const data=await response.json() as {item:SavedItem;error?:string};
      if(!response.ok){conflict=response.status===409;throw new Error(data.error || "保存失败，请重试");}
      const current=itemsRef.current,found=current.some(i=>i.id===item.id),next=found?current.map(i=>i.id===item.id?data.item:i):[...current,data.item];itemsRef.current=next;setItems(next);
      setSync("saved");return data.item;
    } catch(e) {
      setSync("error");setError(e instanceof Error?e.message:"网络异常，本次操作尚未保存");return null;
    } finally {
      pendingRef.current.delete(item.id);setPending(new Set(pendingRef.current));
      if(pendingRef.current.size)setSync("saving");
      if(conflict){const message="另一端刚刚修改了这项内容，已刷新墙面。请核对后重试。";const fresh=await refresh(true);const current=fresh?.find(i=>i.id===item.id);if(current&&current.kind!=="layout")setEditor(e=>e?.original?.id===item.id?{...e,original:current}:e);setNotice({text:message});}
    }
  }
  async function archive(item:SavedContentItem) {
    const saved=await save({...withoutServerFields(item),archivedAt:now()},item.revision);
    if(saved&&saved.kind!=="layout")setNotice({text:item.kind==="todo"?"完成了一件事，已收进归档。":"这张纸已收进归档。",undo:()=>{void restore(saved);}});
    return !!saved;
  }
  function placeInOrder<T>(operation:()=>Promise<T>):Promise<T>{
    const next=placementQueue.current.catch(()=>{}).then(operation);placementQueue.current=next.then(()=>{},()=>{});return next;
  }
  function occupiedBounds(excludeId?:string):Bounds[]{
    const nodes=[...(plane.current?.querySelectorAll<HTMLElement>(":scope > .paper")||[])],result:Bounds[]=[];
    const layout=itemsRef.current.find(i=>i.kind==="layout");
    if(excludeId!==RECENT_LAYOUT_ID){const node=nodes.find(n=>n.classList.contains("recent-paper"));result.push(paperBounds(layout?.kind==="layout"?layout:{x:56,y:62},node?.offsetWidth||326,node?.offsetHeight||378,-1.3));}
    for(const item of itemsRef.current){if(item.kind!=="paper"||item.archivedAt||item.id===excludeId)continue;const node=nodes.find(n=>n.dataset.paperId===item.id);result.push(paperBounds(item,node?.offsetWidth||304,node?.offsetHeight||400+item.stages.length*95,item.tilt));}
    return result;
  }
  async function freePosition(item:Paper):Promise<Position|null>{
    await document.fonts.ready;
    const container=document.createElement("div");container.className="placement-measure";container.inert=true;container.setAttribute("aria-hidden","true");document.body.appendChild(container);
    const root=createRoot(container);
    try{
      // Measure the exact same component, including wrapped title, note and
      // stage text, at this device's current font sizes and width.
      flushSync(()=>root.render(<FlowPaperCard item={item} disabled/>));
      const element=container.querySelector<HTMLElement>(".paper");if(!element||!element.offsetWidth||!element.offsetHeight)return null;
      return findEmptyPosition(paperBounds({x:0,y:0},element.offsetWidth,element.offsetHeight,item.tilt),occupiedBounds(item.id),item);
    }finally{flushSync(()=>root.unmount());container.remove();}
  }
  function focusPaper(item:Paper){
    const rect=viewport.current!.getBoundingClientRect(),scale=window.innerWidth<650?Math.min(1,(rect.width-70)/304):viewRef.current.scale;
    setActivePaper(item.id);setView({scale,x:rect.width/2-(item.x+152)*scale,y:65-item.y*scale});
  }
  async function clearRecentSpace(){
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const element=plane.current?.querySelector<HTMLElement>(".recent-paper");if(!element)return;
    const layout=itemsRef.current.find(i=>i.kind==="layout"),origin=layout?.kind==="layout"?layout:{x:56,y:62};
    const position=findEmptyPosition(paperBounds({x:0,y:0},element.offsetWidth,element.offsetHeight,-1.3),occupiedBounds(RECENT_LAYOUT_ID),origin);
    if(!position){setNotice({text:"近期事项周围没有足够空白，请腾出一些位置。"});return;}
    if(position.x===origin.x&&position.y===origin.y)return;
    const saved=await save({id:RECENT_LAYOUT_ID,kind:"layout",title:"近期事项位置",createdAt:layout?.createdAt??now(),archivedAt:null,...position},layout?.revision??0);
    if(saved){const width=viewport.current?.clientWidth||window.innerWidth,scale=width<650?Math.min(.93,(width-40)/326):viewRef.current.scale;setView({scale,x:(width<650?20:56)-position.x*scale,y:(width<650?24:62)-position.y*scale});}
  }
  async function restore(item:SavedContentItem) {
    await placeInOrder(async()=>{
      const fresh=await refresh(true);if(!fresh)return;flushSync(()=>setItems(fresh));
      const current=fresh.find(i=>i.id===item.id)||item;if(current.kind==="layout"||current.archivedAt===null)return;
      let payload=withoutServerFields(current);payload={...payload,archivedAt:null};
      if(payload.kind==="paper"){const at=await freePosition(payload);if(!at){setNotice({text:"墙面没有足够空白，请先腾出一些位置。"});return;}payload={...payload,...at};}
      const saved=await save(payload,current.revision);
      if(saved){if(saved.kind==="paper")focusPaper(saved);else await clearRecentSpace();setNotice({text:"已放回墙上的空白位置。"});}
    });
  }
  async function addTodo(e:FormEvent) {
    e.preventDefault();const title=quickTodo.trim();if(!title || !loaded || quickBusyRef.current)return;
    quickBusyRef.current=true;setQuickBusy(true);
    const item:Todo={kind:"todo",id:newId(),title,note:"",createdAt:now(),archivedAt:null};
    try{await placeInOrder(async()=>{const fresh=await refresh(true);if(!fresh)return;flushSync(()=>setItems(fresh));const result=await save(item,0);if(result){setQuickTodo("");await clearRecentSpace();}});}finally{quickBusyRef.current=false;setQuickBusy(false);}
  }

  function resetView() {
    const width=viewport.current?.clientWidth||window.innerWidth;
    const scale=width<650?Math.min(.93,(width-40)/326):1;
    const recent=itemsRef.current.find(i=>i.kind==="layout"),x=recent?.kind==="layout"?recent.x:56,y=recent?.kind==="layout"?recent.y:62;
    setView({x:(width<650?20:56)-x*scale,y:(width<650?24:62)-y*scale,scale});
  }
  function zoom(factor:number,anchor?:{x:number;y:number}) {
    const rect=viewport.current?.getBoundingClientRect();if(!rect)return;
    const a=anchor||{x:rect.width/2,y:rect.height/2};
    setView(v=>{const scale=clamp(v.scale*factor,.3,1.8);const ratio=scale/v.scale;return {scale,x:a.x-(a.x-v.x)*ratio,y:a.y-(a.y-v.y)*ratio};});
  }
  function fitAll() {
    const rect=viewport.current?.getBoundingClientRect();if(!rect)return;
    const bounds=occupiedBounds();
    const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top));
    const right=Math.max(...bounds.map(b=>b.right)),bottom=Math.max(...bounds.map(b=>b.bottom));
    const scale=clamp(Math.min((rect.width-60)/(right-left),(rect.height-80)/(bottom-top),1),.3,1.8);
    setView({scale,x:(rect.width-(right-left)*scale)/2-left*scale,y:35-top*scale});
  }
  useEffect(()=>{
    const el=viewport.current;if(!el)return;
    const wheel=(event:WheelEvent)=>{
      if((event.target as HTMLElement).closest("button,input,textarea,.modal,.todo-scroll"))return;
      event.preventDefault();const rect=el.getBoundingClientRect();
      const a={x:event.clientX-rect.left,y:event.clientY-rect.top};
      setView(v=>{const scale=clamp(v.scale*Math.exp(-event.deltaY*.0012),.3,1.8),r=scale/v.scale;return {scale,x:a.x-(a.x-v.x)*r,y:a.y-(a.y-v.y)*r};});
    };
    el.addEventListener("wheel",wheel,{passive:false});return()=>el.removeEventListener("wheel",wheel);
  },[]);

  function pointSummary(){const values=[...points.current.values()];const center={x:values.reduce((s,p)=>s+p.x,0)/values.length,y:values.reduce((s,p)=>s+p.y,0)/values.length};const distance=values.length>1?Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y):0;return {center,distance,count:values.length};}
  function captureViewportDown(e:ReactPointerEvent<HTMLDivElement>){
    touchStart(e);if(touchCamera.current)return;
    if(e.button===1||(wallPanMode&&e.button===0)){
      if(e.button===0&&(e.target as HTMLElement).closest("input,textarea,[contenteditable=true]"))return;
      startPan(e,true);
    }
  }
  function startPan(e:ReactPointerEvent<HTMLElement>,anywhere=false) {
    if(touchCamera.current)return;
    if(e.button!==0&&!(anywhere&&e.button===1))return;
    if(!anywhere&&(e.target as HTMLElement).closest(".paper,button,input,textarea"))return;
    if(anywhere){e.preventDefault();e.stopPropagation();}
    e.currentTarget.setPointerCapture(e.pointerId);points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const p=pointSummary();pan.current={view:viewRef.current,point:p.center,distance:p.distance,count:p.count};setDragging(true);
  }
  function movePan(e:ReactPointerEvent<HTMLDivElement>) {
    if(!points.current.has(e.pointerId)||!pan.current)return;
    points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=pointSummary(),initial=pan.current;
    const rect=viewport.current!.getBoundingClientRect();const scale=p.count>1&&initial.distance?clamp(initial.view.scale*p.distance/initial.distance,.3,1.8):initial.view.scale;
    const ratio=scale/initial.view.scale;
    if(Math.hypot(p.center.x-initial.point.x,p.center.y-initial.point.y)>4)suppressClickUntil.current=Date.now()+350;
    setView({scale,x:p.center.x-rect.left-(initial.point.x-rect.left-initial.view.x)*ratio,y:p.center.y-rect.top-(initial.point.y-rect.top-initial.view.y)*ratio});
  }
  function endPan(e:ReactPointerEvent<HTMLDivElement>) {
    points.current.delete(e.pointerId);if(points.current.size){const p=pointSummary();pan.current={view:viewRef.current,point:p.center,distance:p.distance,count:p.count};}else{pan.current=null;setDragging(false);}
  }
  function touchStart(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType!=="touch")return;
    points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.current.size<2)return;
    const g=gesture.current;
    if(g){g.element.classList.remove("is-dragging");g.element.style.left=`${g.origX}px`;g.element.style.top=`${g.origY}px`;releasePaper(g.element);gesture.current=null;}
    e.currentTarget.setPointerCapture(e.pointerId);
    const p=pointSummary();pan.current={view:viewRef.current,point:p.center,distance:p.distance,count:p.count};
    touchCamera.current=true;setDragging(true);e.preventDefault();e.stopPropagation();
  }
  function touchMove(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==="touch"&&touchCamera.current){e.preventDefault();e.stopPropagation();movePan(e);}
  }
  function touchEnd(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType!=="touch")return;
    if(touchCamera.current){e.preventDefault();e.stopPropagation();endPan(e);suppressClickUntil.current=Date.now()+350;if(!points.current.size)touchCamera.current=false;}
    else if(!pan.current)points.current.delete(e.pointerId);
  }
  function startTopEdge(e:ReactPointerEvent<HTMLElement>,item?:PaperItem){
    if(!(e.target instanceof Element)||e.target.closest("button,input,textarea,a,[contenteditable=true]"))return;
    const paper=e.currentTarget,rect=paper.getBoundingClientRect(),matrix=new DOMMatrix(getComputedStyle(paper).transform);
    const dx=(e.clientX-rect.left-rect.width/2)/viewRef.current.scale,dy=(e.clientY-rect.top-rect.height/2)/viewRef.current.scale;
    const localY=paper.offsetHeight/2-dx*matrix.b+dy*matrix.a;
    // Test the whole top band in paper coordinates, including its bare left
    // and right corners, rather than depending on the child header's box.
    if(localY>=-22&&localY<=54)startPaper(e,item);
  }
  function startPaper(e:ReactPointerEvent<HTMLElement>,item?:PaperItem) {
    const layout=itemsRef.current.find(i=>i.kind==="layout"),position=item||(layout?.kind==="layout"?layout:{id:RECENT_LAYOUT_ID,x:56,y:62});
    if(e.button!==0 || !loaded || pendingRef.current.has(position.id) || gesture.current)return;
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    const el=e.currentTarget.closest(".paper") as HTMLElement;
    gesture.current={id:position.id,startX:e.clientX,startY:e.clientY,origX:position.x,origY:position.y,element:el,moved:false,dx:0,dy:0,lastX:0,lastY:0,lastTime:performance.now()};setActivePaper(position.id);
  }
  function movePaper(e:ReactPointerEvent<HTMLElement>) {
    const g=gesture.current;if(!g)return;e.stopPropagation();
    const dx=(e.clientX-g.startX)/viewRef.current.scale,dy=(e.clientY-g.startY)/viewRef.current.scale;
    g.dx=clamp(g.origX+dx,-2800,5800)-g.origX;g.dy=clamp(g.origY+dy,-2800,5800)-g.origY;
    if(Math.abs(dx)+Math.abs(dy)>4){
      const timestamp=performance.now(),elapsed=Math.max(8,timestamp-g.lastTime);
      dragPaperMotion(g.element,(g.dx-g.lastX)/elapsed,(g.dy-g.lastY)/elapsed);
      g.lastX=g.dx;g.lastY=g.dy;g.lastTime=timestamp;
      g.moved=true;g.element.classList.add("is-dragging");g.element.style.left=`${g.origX+g.dx}px`;g.element.style.top=`${g.origY+g.dy}px`;
    }
  }
  async function endPaper(e:ReactPointerEvent<HTMLElement>,cancel=false) {
    const g=gesture.current;if(!g)return;e.stopPropagation();gesture.current=null;g.element.classList.remove("is-dragging");releasePaper(g.element);
    const item=itemsRef.current.find(i=>i.id===g.id);
    if(g.moved&&!cancel){
      const payload:Paper|WallLayout=g.id===RECENT_LAYOUT_ID
        ?{id:RECENT_LAYOUT_ID,kind:"layout",title:"近期事项位置",createdAt:item?.createdAt??now(),archivedAt:null,x:g.origX+g.dx,y:g.origY+g.dy}
        :{...withoutServerFields(item!),x:g.origX+g.dx,y:g.origY+g.dy} as Paper;
      const result=await save(payload,item?.revision??0);if(result)return;
    }
    const restorePosition=()=>{if(gesture.current?.element===g.element)return;const latest=itemsRef.current.find(i=>i.id===g.id);const position=latest&&(latest.kind==="paper"||latest.kind==="layout")?latest:{x:g.origX,y:g.origY};g.element.style.left=`${position.x}px`;g.element.style.top=`${position.y}px`;};
    restorePosition();requestAnimationFrame(restorePosition);
  }
  function newPaper(){
    const rect=viewport.current!.getBoundingClientRect(),v=viewRef.current;
    const x=(rect.width*.62-v.x)/v.scale-152;
    const y=(rect.height*.22-v.y)/v.scale;
    setEditor({mode:"paper",at:{x:clamp(x,-2800,5700),y:clamp(y,-2800,5700)}});
  }
  async function submitEditor(data:{title:string;note:string;color:Paper["color"];stages:Paper["stages"]}) {
    if(!editor)return false;
    const original=editor.original;
    const base={id:original?.id||newId(),title:data.title,note:data.note,createdAt:original?.createdAt||now(),archivedAt:original?.archivedAt??null};
    const item:WallItem=editor.mode==="todo"?{...base,kind:"todo"}:{...base,kind:"paper",color:data.color,stages:data.stages,x:original?.kind==="paper"?original.x:editor.at!.x,y:original?.kind==="paper"?original.y:editor.at!.y,tilt:original?.kind==="paper"?original.tilt:(Math.random()-.5)*2.4};
    return placeInOrder(async()=>{
      const fresh=await refresh(true);if(!fresh)return false;flushSync(()=>setItems(fresh));
      let payload=item;
      if(item.kind==="paper"){const at=await freePosition(item);if(!at){setNotice({text:"墙面没有足够空白，请先腾出一些位置。"});return false;}payload={...item,...at};}
      const result=await save(payload,original?.revision??0);
      if(result){setEditor(null);if(result.kind==="paper"&&(!original||original.kind!=="paper"||result.x!==original.x||result.y!==original.y))focusPaper(result);else if(result.kind==="todo")await clearRecentSpace();return true;}return false;
    });
  }
  async function toggleStage(item:PaperItem,stageId:string){
    const stages=item.stages.map(s=>s.id===stageId?{...s,done:!s.done}:s);
    const result=await save({...withoutServerFields(item),stages} as Paper,item.revision);
    if(result&&stages.every(s=>s.done))setNotice({text:"每一步都完成了，可以把这张纸收进归档。"});
  }
  function exportData(){
    const blob=new Blob([JSON.stringify({app:"纸上",version:1,exportedAt:new Date().toISOString(),items:itemsRef.current},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`纸上备份-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  const todos=items.filter((i):i is TodoItem=>i.kind==="todo"&&!i.archivedAt).sort((a,b)=>a.createdAt-b.createdAt);
  const papers=items.filter((i):i is PaperItem=>i.kind==="paper"&&!i.archivedAt).sort((a,b)=>a.createdAt-b.createdAt);
  const archived=items.filter((i):i is SavedContentItem=>i.kind!=="layout"&&i.archivedAt!==null).sort((a,b)=>(b.archivedAt||0)-(a.archivedAt||0));
  const recent=items.find(i=>i.kind==="layout");
  const statusText=sync==="loading"?"正在打开墙面":sync==="saving"?"正在保存":sync==="error"?"连接中断":"已同步";
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL||"/"} aria-label="纸上首页"><span className="brand-mark"><span/></span><span>纸上<span className="brand-dot">。</span></span></a><span className="brand-divider"/><span className="room-label">我的事项墙</span><div className="topbar-right"><span className={`sync-status ${sync}`} aria-live="polite"><span/>{statusText}</span><button className="quiet-button archive-button" onClick={()=>setArchiveOpen(true)}><Icon name="archive"/><span>归档盒</span>{archived.length>0?<b>{archived.length}</b>:null}</button><button className="primary add-paper" onClick={newPaper} disabled={!loaded}><Icon name="plus"/><span>贴一张纸</span></button></div></header>
    <main ref={viewport} className={`wall-viewport ${dragging?"is-panning":""} ${wallPanMode?"wall-pan-mode":""}`} aria-label="事项墙，可在空白处拖动" onPointerDownCapture={captureViewportDown} onPointerMoveCapture={touchMove} onPointerUpCapture={touchEnd} onPointerCancelCapture={touchEnd} onClickCapture={e=>{if(Date.now()<suppressClickUntil.current){e.preventDefault();e.stopPropagation();}}} onPointerDown={e=>startPan(e)} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
      <div className="wall-grain"/>
      <div ref={plane} className="wall-plane" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}>
        <section draggable={false} className={`paper recent-paper ${activePaper===RECENT_LAYOUT_ID?"is-front":""}`} style={{left:recent?.kind==="layout"?recent.x:56,top:recent?.kind==="layout"?recent.y:62}} aria-label="近期事项" onPointerDownCapture={e=>startTopEdge(e)} onPointerMove={movePaper} onPointerUp={e=>void endPaper(e)} onPointerCancel={e=>void endPaper(e,true)} onLostPointerCapture={e=>void endPaper(e,true)}>
          <span className="tape tape-recent" title="拖动胶带或纸张上沿移动位置"/><div className="paper-drag-handle recent-heading" title="拖动上沿或左右角移动近期事项" aria-label="移动近期事项"><span className="eyebrow">ONE THING AT A TIME</span><span className="paper-number">01 /</span><span className="grip-dots" aria-hidden="true">⠿</span></div>
          <h1>近期事项<span className="tiny-star">✳</span></h1><p className="paper-subtitle">记下来，一件一件慢慢来。</p><div className="pencil-line"/>
          <div className="todo-scroll">
            {!loaded?<div className="empty-todos"><span className="empty-circle"/><p>{sync==="error"?"墙面还没打开":"正在取下防尘布…"}</p>{sync==="error"?<button className="text-button" onClick={()=>void refresh()}>重新连接</button>:null}</div>:todos.length===0?<div className="empty-todos"><span className="empty-circle"/><p>暂时没有挂心的事</p><small>把接下来想做的，写在下面。</small></div>:todos.map(item=><div className={`todo-row ${pending.has(item.id)?"is-busy":""}`} key={item.id}><button className="check-circle" aria-label={`完成并归档：${item.title}`} disabled={pending.has(item.id)} onClick={()=>void archive(item)}><Icon name="check" size={12}/></button><button className="todo-content" onClick={()=>setEditor({mode:"todo",original:item})} disabled={pending.has(item.id)}><span>{item.title}</span>{item.note?<small>{item.note}</small>:null}</button><button className="row-edit" aria-label={`编辑：${item.title}`} onClick={()=>setEditor({mode:"todo",original:item})}><Icon name="edit" size={14}/></button></div>)}
          </div>
          <form className="quick-add" onSubmit={addTodo}><Icon name="plus" size={17}/><input aria-label="添加近期事项" placeholder="添加一件小事…" maxLength={120} value={quickTodo} onChange={e=>setQuickTodo(e.target.value)} disabled={!loaded}/><button type="submit" aria-label="添加事项" disabled={!quickTodo.trim()||!loaded||quickBusy}><span>↵</span></button></form>
          <div className="paper-footer"><span>{todos.length?`${String(todos.length).padStart(2,"0")} 件待办`:"留一点空白，也很好"}</span><span className="handwritten">take your time</span></div>
          <button className="paper-curl" type="button" aria-label="轻掀近期事项纸角" title="轻掀纸角，也可以直接拖拽纸面" onClick={e=>peelPaper(e.currentTarget.closest<HTMLElement>(".paper")!)}/>
        </section>
        {papers.map((item,index)=><FlowPaperCard key={item.id} item={item} index={index} active={activePaper===item.id} disabled={pending.has(item.id)} onStart={e=>startTopEdge(e,item)} onMove={movePaper} onEnd={(e,cancel)=>void endPaper(e,cancel)} onEdit={()=>setEditor({mode:"paper",original:item})} onToggle={id=>void toggleStage(item,id)} onArchive={()=>void archive(item)}/>)}
      </div>
      <div className="wall-caption" aria-hidden="true"><span>给计划一个位置，</span><span>给自己一点时间。</span></div>
    </main>
    <div className="wall-controls"><IconButton label="缩小墙面" name="minus" onClick={()=>zoom(1/1.15)}/><span className="zoom-value">{Math.round(view.scale*100)}%</span><IconButton label="放大墙面" name="plus" onClick={()=>zoom(1.15)}/><span className="control-divider"/><button type="button" className={`fit-button pan-button ${wallPanMode?"selected":""}`} aria-label="拖墙模式" aria-pressed={wallPanMode} title="开启后可从纸面拖动整面墙；鼠标中键也可直接拖墙" onClick={()=>setWallPanMode(v=>!v)}><Icon name="move" size={16}/><span>拖墙</span></button><IconButton label="回到近期事项" name="home" onClick={resetView}/><button className="fit-button" title="查看全部纸张" onClick={fitAll}>全览</button></div>
    <footer className="bottom-bar"><span className="date-label">{date}</span><span className="gesture-hint">{wallPanMode?"拖动任意纸面移动墙面":"空白处 / 中键拖动墙面"} <i>·</i> 滚轮 / 双指缩放 <i>·</i> 拖动纸张上沿摆放</span><span className="small-motto">不着急，一步一步来。</span></footer>
    {error?<div className="error-banner" role="alert"><span>{error}</span><button className="text-button" onClick={()=>void refresh()} disabled={pending.size>0}><Icon name="refresh" size={15}/>重试</button></div>:null}
    {notice?<div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15}/></span>{notice.text}{notice.undo?<button onClick={()=>{notice.undo?.();setNotice(null);}}>撤销</button>:null}<IconButton name="close" label="关闭提示" onClick={()=>setNotice(null)}/></div>:null}
    {editor?<EditDialog key={editor.original?.id||editor.mode} editor={editor} onClose={()=>setEditor(null)} onSubmit={submitEditor} onArchive={editor.original?()=>void archive(editor.original!).then(ok=>{if(ok)setEditor(null);}):undefined}/>:null}
    {archiveOpen?<ArchiveDialog items={archived} pending={pending} onClose={()=>setArchiveOpen(false)} onRestore={restore} onExport={exportData}/>:null}
  </div>;
}

function FlowPaperCard({item,index=0,active=false,disabled=false,onStart,onMove,onEnd,onEdit,onToggle,onArchive}:{item:Paper;index?:number;active?:boolean;disabled?:boolean;onStart?:(e:ReactPointerEvent<HTMLElement>)=>void;onMove?:(e:ReactPointerEvent<HTMLElement>)=>void;onEnd?:(e:ReactPointerEvent<HTMLElement>,cancel:boolean)=>void;onEdit?:()=>void;onToggle?:(id:string)=>void;onArchive?:()=>void}) {
  const current=item.stages.findIndex(s=>!s.done),done=item.stages.filter(s=>s.done).length;
  return <section data-paper-id={item.id} draggable={false} className={`paper flow-paper ${item.color} ${active?"is-front":""}`} style={{left:item.x,top:item.y,"--tilt":`${item.tilt}deg`} as React.CSSProperties} aria-label={`流程纸：${item.title}`} onPointerDownCapture={onStart} onPointerMove={onMove} onPointerUp={e=>onEnd?.(e,false)} onPointerCancel={e=>onEnd?.(e,true)} onLostPointerCapture={e=>onEnd?.(e,true)}>
          <span className="tape" title="拖动胶带或纸张上沿移动位置"/><div className="paper-drag-handle" title="拖动上沿或左右角移动这张纸"><span className="eyebrow">LITTLE STEPS, BIG THINGS</span><span className="grip-dots" aria-hidden="true">⠿</span></div>
          <div className="flow-title-row"><h2>{item.title}</h2><IconButton name="edit" label={`编辑流程：${item.title}`} onClick={()=>onEdit?.()} disabled={disabled}/></div>
          {item.note?<p className="flow-note">{item.note}</p>:null}<div className="flow-progress"><span>{done===item.stages.length?"每一步，都算数。":"一点一点，往前走。"}</span><span>{done} / {item.stages.length}</span></div><div className="progress-track"><span style={{width:`${done/item.stages.length*100}%`}}/></div>
          <ol className="stage-list">{item.stages.map((stage,n)=><li className={`${stage.done?"stage-done":""} ${current===n?"stage-current":""}`} key={stage.id}><div className="stage-row"><button className={`check-circle ${stage.done?"checked":""}`} aria-label={`${stage.done?"撤销完成":"完成阶段"}：${stage.text}`} aria-pressed={stage.done} disabled={disabled} onClick={()=>onToggle?.(stage.id)}><Icon name="check" size={12}/></button><span>{stage.text}</span>{current===n?<span className="current-dot" title="当前阶段"/>:null}</div>{n<item.stages.length-1?<span className="stage-arrow"><Icon name="arrow" size={21}/></span>:null}</li>)}</ol>
          <div className="flow-bottom"><span className="paper-number">PLAN {String(index+1).padStart(2,"0")}</span><button className="text-button" onClick={onArchive} disabled={disabled}><Icon name="archive" size={14}/>{done===item.stages.length?"完成，归档":"收进归档"}</button></div><button className="paper-curl" type="button" aria-label={`轻掀纸角：${item.title}`} title="轻掀纸角，也可以直接拖拽纸面" onClick={e=>peelPaper(e.currentTarget.closest<HTMLElement>(".paper")!)}/>
        </section>;
}

function Modal({children,onClose,label,className=""}:{children:ReactNode;onClose:()=>void;label:string;className?:string}) {
  const ref=useRef<HTMLDivElement>(null);
  // Closing may depend on current state (for example, whether a save is pending).
  // Keep that callback fresh without restarting the dialog's focus lifecycle.
  const onCloseRef=useRef(onClose);
  useEffect(()=>{onCloseRef.current=onClose;},[onClose]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]');
    if(!ref.current?.contains(document.activeElement)){
      const initial=ref.current?.querySelector<HTMLElement>("input:not([disabled]),textarea:not([disabled])")||focusable()?.[0];
      initial?.focus();
    }
    const handler=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();onCloseRef.current();}if(e.key==="Tab"){const all=focusable();if(!all?.length)return;const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    document.addEventListener("keydown",handler);return()=>{document.removeEventListener("keydown",handler);if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="modal-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>{children}</div></div>;
}
function EditDialog({editor,onClose,onSubmit,onArchive}:{editor:Editor;onClose:()=>void;onSubmit:(data:{title:string;note:string;color:Paper["color"];stages:Paper["stages"]})=>Promise<boolean>;onArchive?:()=>void}) {
  const old=editor.original;
  const [title,setTitle]=useState(old?.title||"");const [note,setNote]=useState(old?.note||"");
  const [color,setColor]=useState<Paper["color"]>(old?.kind==="paper"?old.color:"linen");
  const [stages,setStages]=useState<Paper["stages"]>(old?.kind==="paper"?old.stages:[{id:newId(),text:"",done:false},{id:newId(),text:"",done:false},{id:newId(),text:"",done:false}]);
  const [busy,setBusy]=useState(false);const [validation,setValidation]=useState("");
  const busyRef=useRef(false);
  const close=useCallback(()=>{if(!busyRef.current)onClose();},[onClose]);
  async function submit(e:FormEvent){e.preventDefault();if(busyRef.current)return;const cleanStages=stages.filter(s=>s.text.trim()).map(s=>({...s,text:s.text.trim()}));if(!title.trim()){setValidation("先给这件事写个名字吧。");return;}if(editor.mode==="paper"&&!cleanStages.length){setValidation("至少写下一个阶段。");return;}setValidation("");busyRef.current=true;setBusy(true);try{const ok=await onSubmit({title:title.trim(),note:note.trim(),color,stages:cleanStages});if(!ok)setValidation("这次还没有保存成功。你的文字保留在这里，请核对墙面后重试。");}finally{busyRef.current=false;setBusy(false);}}
  return <Modal onClose={close} label={old?"编辑事项":"贴下一个新计划"} className="edit-modal"><div className="modal-header"><div><span className="eyebrow">A PLACE FOR YOUR NEXT STEP</span><h2>{editor.mode==="todo"?"编辑这件小事":old?"整理这张纸":"贴下一个新计划"}</h2></div><IconButton label="关闭编辑" name="close" onClick={close} disabled={busy}/></div><form onSubmit={submit}><div className="editor-body"><label className="field-label" htmlFor="item-title">{editor.mode==="paper"?"这件事叫什么？":"事项名称"}</label><input className="title-input" id="item-title" placeholder={editor.mode==="paper"?"例如，准备一次旅行":"写下想做的事"} value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required disabled={busy}/><label className="field-label" htmlFor="item-note">留一句话 <span>可选</span></label><textarea id="item-note" className="note-input" placeholder="给这件事加一点说明…" value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} rows={2} disabled={busy}/>
      {editor.mode==="paper"?<><div className="field-label stage-label">把它分成几步 <span>从上往下，一步一步来</span></div><div className="stage-editor">{stages.map((s,i)=><div className="stage-edit-wrap" key={s.id}><div className="stage-edit-row"><span className={`step-index ${s.done?"is-complete":""}`}>{s.done?<Icon name="check" size={12}/>:String(i+1).padStart(2,"0")}</span><input aria-label={`第${i+1}阶段`} placeholder={i===0?"从哪一步开始？":"接下来做什么？"} value={s.text} onChange={e=>setStages(stages.map(t=>t.id===s.id?{...t,text:e.target.value}:t))} maxLength={300} disabled={busy}/><IconButton name="close" label={`移除第${i+1}阶段`} onClick={()=>setStages(stages.filter(t=>t.id!==s.id))} disabled={busy||stages.length===1}/></div>{i<stages.length-1?<span className="editor-arrow">↓</span>:null}</div>)}</div><button type="button" className="text-button add-stage" onClick={()=>setStages([...stages,{id:newId(),text:"",done:false}])} disabled={busy||stages.length>=30}><Icon name="plus" size={16}/>再加一步</button><div className="paper-color-row"><span className="field-label">纸张颜色</span><div className="color-options">{paperColors.map(c=><button type="button" className={`color-swatch ${c.id} ${color===c.id?"selected":""}`} key={c.id} title={c.label} aria-label={`${c.label}纸张`} aria-pressed={color===c.id} disabled={busy} onClick={()=>setColor(c.id)}>{color===c.id?<Icon name="check" size={14}/>:null}</button>)}</div></div></>:null}
      {validation?<p className="form-error" role="alert">{validation}</p>:null}</div><div className="modal-footer">{onArchive?<button className="text-button archive-edit" type="button" onClick={onArchive} disabled={busy}><Icon name="archive" size={15}/>归档</button>:<span className="footer-note">计划可以随时修改。</span>}<div className="footer-buttons"><button type="button" className="quiet-button" onClick={close} disabled={busy}>先放一放</button><button className="primary" type="submit" disabled={busy}>{busy?"正在保存…":editor.mode==="todo"?"保存修改":old?"保存修改":"贴到墙上"}<Icon name={old?"check":"plus"} size={16}/></button></div></div></form></Modal>;
}
function ArchiveDialog({items,pending,onClose,onRestore,onExport}:{items:SavedContentItem[];pending:Set<string>;onClose:()=>void;onRestore:(item:SavedContentItem)=>Promise<void>;onExport:()=>void}) {
  const [tab,setTab]=useState("all");const [query,setQuery]=useState("");
  const filtered=items.filter(i=>(tab==="all"||i.kind===tab)&&i.title.toLowerCase().includes(query.toLowerCase()));
  return <Modal onClose={onClose} label="归档盒" className="archive-modal"><div className="modal-header"><div><span className="eyebrow">GOOD THINGS, DONE</span><h2>归档盒<span className="heading-count">{items.length}</span></h2><p>做过的事，都好好收在这里。</p></div><IconButton label="关闭归档盒" name="close" onClick={onClose}/></div><div className="archive-tools"><div className="archive-tabs">{[{id:"all",label:"全部"},{id:"todo",label:"近期事项"},{id:"paper",label:"流程纸"}].map(t=><button key={t.id} className={tab===t.id?"selected":""} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div><input className="archive-search" aria-label="搜索归档" placeholder="找一件事…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="archive-list">{filtered.length===0?<div className="archive-empty"><Icon name="archive" size={34}/><h3>{query?"没有找到这件事":"这里还空着"}</h3><p>{query?"换个关键词再试试。":"完成的事项、收起的计划，会出现在这里。"}</p></div>:filtered.map(item=><div className="archive-item" key={item.id}><span className={`archive-item-icon ${item.kind==="paper"?item.color:"linen"}`}><Icon name={item.kind==="todo"?"check":"archive"} size={17}/></span><div className="archive-item-text"><h3>{item.title}</h3>{item.kind==="paper"?<p>{item.stages.map(s=>(s.done?"✓ ":"")+s.text).join(" → ")}</p>:item.note?<p>{item.note}</p>:null}<small>{item.kind==="todo"?"近期事项":"流程纸"}<i>·</i>{new Date(item.archivedAt!).toLocaleDateString("zh-CN")}{item.kind==="paper"?` · ${item.stages.filter(s=>s.done).length}/${item.stages.length} 步完成`:""}</small></div><button className="restore-button" onClick={()=>void onRestore(item)} disabled={pending.has(item.id)}><Icon name="undo" size={15}/><span>放回墙上</span></button></div>)}</div><div className="modal-footer"><span className="footer-note">归档会保留内容，随时可以恢复。</span><button className="text-button" onClick={onExport}><Icon name="download" size={15}/>导出备份</button></div></Modal>;
}
