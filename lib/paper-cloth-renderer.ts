import type { PaperCloth } from "./paper-cloth-physics";

const vertexSource=`
attribute vec3 a_position;attribute vec3 a_normal;attribute vec2 a_uv;
uniform vec2 u_resolution;uniform vec2 u_origin;uniform float u_padding;
varying vec2 v_uv;varying vec3 v_normal;
void main(){
  float w=1.0-a_position.z/1000.0;
  vec2 projected=(a_position.xy-u_origin)/w+u_origin+vec2(u_padding);
  vec2 clip=vec2(projected.x/u_resolution.x*2.0-1.0,1.0-projected.y/u_resolution.y*2.0);
  gl_Position=vec4(clip*w,-a_position.z/1000.0*w,w);v_uv=a_uv;v_normal=a_normal;
}`;
const fragmentSource=`
precision mediump float;uniform sampler2D u_texture;uniform vec3 u_back;uniform bool u_tape;
varying vec2 v_uv;varying vec3 v_normal;
void main(){
  vec4 ink=texture2D(u_texture,v_uv);if(ink.a<0.025)discard;
  if(u_tape){gl_FragColor=ink;return;}
  vec3 n=normalize(v_normal);if(!gl_FrontFacing)n=-n;
  float light=0.77+0.27*max(dot(n,normalize(vec3(-0.32,-0.43,0.84))),0.0);
  vec3 color=gl_FrontFacing?ink.rgb:u_back;
  gl_FragColor=vec4(color*light,ink.a);
}`;
function tapeImage(){
  const canvas=document.createElement("canvas");canvas.width=200;canvas.height=64;
  const ctx=canvas.getContext("2d")!;ctx.beginPath();ctx.moveTo(1,5);
  ctx.lineTo(8,1);ctx.lineTo(16,4);ctx.lineTo(26,1);ctx.lineTo(36,4);ctx.lineTo(49,1);ctx.lineTo(198,1);
  ctx.lineTo(195,14);ctx.lineTo(199,27);ctx.lineTo(195,39);ctx.lineTo(199,52);ctx.lineTo(196,63);
  ctx.lineTo(130,60);ctx.lineTo(69,63);ctx.lineTo(4,60);ctx.lineTo(8,45);ctx.lineTo(2,35);ctx.lineTo(7,22);ctx.closePath();
  const gradient=ctx.createLinearGradient(0,0,200,0);gradient.addColorStop(0,"rgba(165,172,141,.62)");gradient.addColorStop(.35,"rgba(180,185,154,.73)");gradient.addColorStop(1,"rgba(169,176,140,.67)");ctx.fillStyle=gradient;ctx.fill();
  ctx.save();ctx.clip();ctx.strokeStyle="rgba(250,248,223,.07)";ctx.lineWidth=1;for(let x=0;x<200;x+=5){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+3,64);ctx.stroke();}ctx.restore();return canvas;
}

export class PaperClothRenderer{
  readonly layer:HTMLDivElement;
  readonly canvas:HTMLCanvasElement;
  private readonly gl:WebGLRenderingContext;
  private readonly program:WebGLProgram;
  private readonly positions:Float32Array;
  private readonly normals:Float32Array;
  private readonly uv:Float32Array;
  private readonly positionBuffer:WebGLBuffer;
  private readonly normalBuffer:WebGLBuffer;
  private readonly uvBuffer:WebGLBuffer;
  private readonly indexBuffer:WebGLBuffer;
  private readonly paperTexture:WebGLTexture;
  private readonly tapeTexture:WebGLTexture;
  private readonly shadow:SVGSVGElement;
  private readonly shadowPath:SVGPathElement;
  private readonly tape:{x:number;y:number;width:number;height:number;angle:number};
  private readonly padding=220;
  private readonly resolution:{width:number;height:number};
  private readonly onLost:(event:Event)=>void;
  constructor(private readonly paper:HTMLElement,private readonly cloth:PaperCloth,texture:HTMLCanvasElement,onLost:()=>void){
    this.layer=document.createElement("div");this.layer.className="paper-flex paper-cloth-layer";this.layer.setAttribute("aria-hidden","true");this.layer.inert=true;
    this.shadow=document.createElementNS("http://www.w3.org/2000/svg","svg");this.shadow.classList.add("paper-flex-shadow");this.shadow.setAttribute("width",String(cloth.width));this.shadow.setAttribute("height",String(cloth.height));
    this.shadowPath=document.createElementNS("http://www.w3.org/2000/svg","path");this.shadowPath.setAttribute("fill","#303326");this.shadow.appendChild(this.shadowPath);this.layer.appendChild(this.shadow);
    this.canvas=document.createElement("canvas");this.canvas.className="paper-cloth-canvas";this.canvas.dataset.renderer="point-mesh";
    this.resolution={width:cloth.width+this.padding*2,height:cloth.height+this.padding*2};
    const ratio=Math.min(window.devicePixelRatio||1,1.6,4000/this.resolution.height);
    this.canvas.width=Math.ceil(this.resolution.width*ratio);this.canvas.height=Math.ceil(this.resolution.height*ratio);
    Object.assign(this.canvas.style,{position:"absolute",left:`${-this.padding}px`,top:`${-this.padding}px`,width:`${this.resolution.width}px`,height:`${this.resolution.height}px`,pointerEvents:"none"});
    const gl=this.canvas.getContext("webgl",{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error("WebGL unavailable");this.gl=gl;
    const compile=(type:number,source:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||"Paper shader failed");return shader;};
    const vertex=compile(gl.VERTEX_SHADER,vertexSource),fragment=compile(gl.FRAGMENT_SHADER,fragmentSource);
    this.program=gl.createProgram()!;gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error("Paper renderer failed");
    const buffer=()=>gl.createBuffer()!;
    this.positionBuffer=buffer();this.normalBuffer=buffer();this.uvBuffer=buffer();this.indexBuffer=buffer();
    this.positions=new Float32Array(cloth.nodes.length*3);this.normals=new Float32Array(cloth.nodes.length*3);this.uv=new Float32Array(cloth.nodes.length*2);
    for(let i=0;i<cloth.nodes.length;i++){this.uv[i*2]=cloth.nodes[i].rx/cloth.width;this.uv[i*2+1]=cloth.nodes[i].ry/cloth.height;}
    const upload=(canvas:HTMLCanvasElement)=>{const texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);return texture;};
    this.paperTexture=upload(texture);this.tapeTexture=upload(tapeImage());
    const tape=paper.querySelector<HTMLElement>(":scope > .tape"),matrix=tape?new DOMMatrix(getComputedStyle(tape).transform):new DOMMatrix();
    this.tape={x:tape?.offsetLeft??cloth.width/2-43,y:tape?.offsetTop??-12,width:tape?.offsetWidth??86,height:tape?.offsetHeight??28,angle:Math.atan2(matrix.b,matrix.a)};
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.frontFace(gl.CW);
    this.onLost=event=>{event.preventDefault();onLost();};this.canvas.addEventListener("webglcontextlost",this.onLost);
    this.layer.appendChild(this.canvas);paper.appendChild(this.layer);paper.classList.add("is-flexing");
  }
  private attribute(name:string,buffer:WebGLBuffer,data:Float32Array,size:number){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);const location=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
  pick(x:number,y:number){
    const {cloth}=this,ox=cloth.width/2,oy=cloth.height*.25;
    const projected=cloth.nodes.map(p=>{const w=1-p.z/1000;return {x:ox+(p.x-ox)/w,y:oy+(p.y-oy)/w,w};});
    let best:{u:number;v:number;depth:number}|null=null;
    for(let i=0;i<cloth.triangles.length;i+=3){
      const ai=cloth.triangles[i],bi=cloth.triangles[i+1],ci=cloth.triangles[i+2],a=projected[ai],b=projected[bi],c=projected[ci];
      const denominator=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(denominator)<.00001)continue;
      const ba=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/denominator,bb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/denominator,bc=1-ba-bb;
      if(ba<-.001||bb<-.001||bc<-.001)continue;
      const sum=ba/a.w+bb/b.w+bc/c.w,wa=ba/a.w/sum,wb=bb/b.w/sum,wc=bc/c.w/sum;
      const pa=cloth.nodes[ai],pb=cloth.nodes[bi],pc=cloth.nodes[ci],depth=wa*pa.z+wb*pb.z+wc*pc.z;
      if(!best||depth>best.depth)best={u:(wa*pa.rx+wb*pb.rx+wc*pc.rx)/cloth.width,v:(wa*pa.ry+wb*pb.ry+wc*pc.ry)/cloth.height,depth};
    }
    return best;
  }
  draw(){
    const {gl,cloth}=this;this.normals.fill(0);let totalZ=0,maxZ=0;
    for(let i=0;i<cloth.nodes.length;i++){const p=cloth.nodes[i];this.positions.set([p.x,p.y,p.z],i*3);totalZ+=p.z;maxZ=Math.max(maxZ,p.z);}
    for(let i=0;i<cloth.triangles.length;i+=3){
      const ai=cloth.triangles[i]*3,bi=cloth.triangles[i+1]*3,ci=cloth.triangles[i+2]*3;
      const ax=this.positions[bi]-this.positions[ai],ay=this.positions[bi+1]-this.positions[ai+1],az=this.positions[bi+2]-this.positions[ai+2],bx=this.positions[ci]-this.positions[ai],by=this.positions[ci+1]-this.positions[ai+1],bz=this.positions[ci+2]-this.positions[ai+2];
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
      for(const j of [ai,bi,ci]){this.normals[j]+=nx;this.normals[j+1]+=ny;this.normals[j+2]+=nz;}
    }
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
    gl.uniform2f(gl.getUniformLocation(this.program,"u_resolution"),this.resolution.width,this.resolution.height);gl.uniform2f(gl.getUniformLocation(this.program,"u_origin"),cloth.width/2,cloth.height*.25);gl.uniform1f(gl.getUniformLocation(this.program,"u_padding"),this.padding);
    const back=(getComputedStyle(this.paper).getPropertyValue("--paper").match(/[\da-f]{2}/gi)||[]).map(value=>parseInt(value,16)/255);
    gl.uniform3fv(gl.getUniformLocation(this.program,"u_back"),new Float32Array(back.length===3?back:[.976,.969,.929]));
    this.attribute("a_position",this.positionBuffer,this.positions,3);this.attribute("a_normal",this.normalBuffer,this.normals,3);this.attribute("a_uv",this.uvBuffer,this.uv,2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,cloth.triangles,gl.DYNAMIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,this.paperTexture);gl.uniform1i(gl.getUniformLocation(this.program,"u_tape"),0);gl.drawElements(gl.TRIANGLES,cloth.triangles.length,gl.UNSIGNED_SHORT,0);
    // Tape shares the SAME depth buffer as the sheet. It is close to the wall;
    // raised paper can naturally occlude it, regardless of DOM stacking order.
    const tapePositions=new Float32Array(12),tapeNormals=new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]);
    for(const [i,x,y] of [[0,0,0],[1,1,0],[2,0,1],[3,1,1]]){const px=(x-.5)*this.tape.width,py=(y-.5)*this.tape.height,c=Math.cos(this.tape.angle),s=Math.sin(this.tape.angle);tapePositions.set([this.tape.x+this.tape.width/2+px*c-py*s,this.tape.y+this.tape.height/2+px*s+py*c,1.2],i*3);}
    this.attribute("a_position",this.positionBuffer,tapePositions,3);this.attribute("a_normal",this.normalBuffer,tapeNormals,3);this.attribute("a_uv",this.uvBuffer,new Float32Array([0,0,1,0,0,1,1,1]),2);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2,1,3,2]),gl.DYNAMIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,this.tapeTexture);gl.uniform1i(gl.getUniformLocation(this.program,"u_tape"),1);gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0);
    const outline:number[]=[];for(let x=0;x<=cloth.columns;x++)outline.push(cloth.index(x,0));for(let y=1;y<=cloth.rows;y++)outline.push(cloth.index(cloth.columns,y));for(let x=cloth.columns-1;x>=0;x--)outline.push(cloth.index(x,cloth.rows));for(let y=cloth.rows-1;y>0;y--)outline.push(cloth.index(0,y));
    const path=outline.map(i=>{const p=cloth.nodes[i];return `${(p.x-p.z*.46).toFixed(1)},${(p.y+p.z*.25).toFixed(1)}`;});this.shadowPath.setAttribute("d",`M${path.join(" L")} Z`);this.shadow.style.filter=`blur(${(3+totalZ/cloth.nodes.length*.05).toFixed(1)}px)`;
    this.paper.dataset.flexDepth=String(Math.round(maxZ));this.paper.dataset.flexMesh=`${cloth.columns}x${cloth.rows}`;
  }
  destroy(){const gl=this.gl;this.canvas.removeEventListener("webglcontextlost",this.onLost);for(const buffer of [this.positionBuffer,this.normalBuffer,this.uvBuffer,this.indexBuffer])gl.deleteBuffer(buffer);gl.deleteTexture(this.paperTexture);gl.deleteTexture(this.tapeTexture);gl.deleteProgram(this.program);this.layer.remove();this.paper.classList.remove("is-flexing");delete this.paper.dataset.flexDepth;delete this.paper.dataset.flexMesh;}
}
