import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,readFileSync,writeFileSync,existsSync,statSync} from "node:fs";
import {resolve,dirname,extname,relative,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {itemSchema,saveSchema} from "../lib/wall-model";

const appDir=dirname(fileURLToPath(import.meta.url));
const dataDir=resolve(process.env.DATA_DIR||resolve(appDir,"data"));mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(resolve(dataDir,"wall.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS wall_items(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);");
const all=db.prepare("SELECT payload,revision,updated_at FROM wall_items ORDER BY updated_at DESC");
type Row={payload:string;revision:number;updated_at:number};
const serialize=(row:Row)=>({...JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at});
function exportData(){return {app:"纸上",version:1,exportedAt:new Date().toISOString(),items:(all.all() as Row[]).map(serialize)};}
const args=process.argv.slice(2);
if(args[0]==="--import"){
  if(!args[1])throw new Error("请指定备份 JSON 路径");
  const data=JSON.parse(readFileSync(resolve(args[1]),"utf8"));if(!Array.isArray(data.items))throw new Error("备份缺少 items 数组");
  const checked=data.items.map((entry:Record<string,unknown>)=>{const {revision,updatedAt,...payload}=entry;return {payload:itemSchema.parse(payload),revision:Number.isInteger(revision)&&Number(revision)>0?Number(revision):1,updatedAt:Number.isInteger(updatedAt)&&Number(updatedAt)>0?Number(updatedAt):Date.now()};});
  const insert=db.prepare("INSERT OR IGNORE INTO wall_items(id,kind,payload,revision,updated_at) VALUES(?,?,?,?,?)");let added=0;
  db.exec("BEGIN");try{for(const entry of checked)added+=Number(insert.run(entry.payload.id,entry.payload.kind,JSON.stringify(entry.payload),entry.revision,entry.updatedAt).changes);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
  console.log(JSON.stringify({imported:added,skipped:checked.length-added}));db.close();
}else if(args[0]==="--export"){
  if(!args[1])throw new Error("请指定导出 JSON 路径");writeFileSync(resolve(args[1]),JSON.stringify(exportData(),null,2));console.log("备份已导出");db.close();
}else{
  const publicDir=resolve(appDir,"public"),allowed=new Set((process.env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean));
  const common={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
  const json=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{...common,"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(data));};
  async function handle(req:IncomingMessage,res:ServerResponse){
    const protocol=String(req.headers["x-forwarded-proto"]||"http").split(",")[0].trim();
    const url=new URL(req.url||"/",`${protocol}://${req.headers.host||"localhost"}`),origin=req.headers.origin;
    const permitted=!origin||origin===url.origin||allowed.has(origin);
    if(origin&&allowed.has(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Methods","GET,PUT,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Vary","Origin");}
    if(url.pathname==="/api/items"){
      if(req.method==="OPTIONS"){if(!permitted){json(res,403,{error:"请求来源不匹配"});return;}res.writeHead(204);res.end();return;}
      if(req.method==="GET"){json(res,200,{items:(all.all() as Row[]).map(serialize)});return;}
      if(req.method!=="PUT"){json(res,405,{error:"不支持此请求方式"});return;}
      if(!permitted){json(res,403,{error:"请求来源不匹配"});return;}
      let raw="",bytes=0;
      for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>100000){json(res,413,{error:"内容过长"});return;}raw+=chunk;}
      if(raw.length>24000){json(res,413,{error:"内容过长"});return;}
      let parsed;try{parsed=saveSchema.safeParse(JSON.parse(raw));}catch{json(res,400,{error:"无法识别提交内容"});return;}
      if(!parsed.success){json(res,400,{error:"请检查名称、阶段内容与长度（最多30个阶段）"});return;}
      const {item,revision}=parsed.data,payload=JSON.stringify(item),updatedAt=Date.now();
      const result=revision===0
        ?db.prepare("INSERT OR IGNORE INTO wall_items(id,kind,payload,revision,updated_at) VALUES(?,?,?,?,?)").run(item.id,item.kind,payload,1,updatedAt)
        :db.prepare("UPDATE wall_items SET payload=?,revision=?,updated_at=? WHERE id=? AND revision=? AND kind=?").run(payload,revision+1,updatedAt,item.id,revision,item.kind);
      if(!result.changes){json(res,409,{error:"另一端刚刚修改了这项内容，墙面已刷新。请核对后再操作。"});return;}
      json(res,200,{item:{...item,revision:revision+1,updatedAt}});return;
    }
    if(url.pathname==="/healthz"){json(res,200,{ok:true});return;}
    if(req.method!=="GET"&&req.method!=="HEAD"){json(res,405,{error:"不支持此请求方式"});return;}
    let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{json(res,400,{error:"路径无效"});return;}
    let file=resolve(publicDir,"."+pathname),inside=relative(publicDir,file);
    if(inside.startsWith("..")||isAbsolute(inside)){json(res,403,{error:"路径无效"});return;}
    if(existsSync(file)&&statSync(file).isDirectory())file=resolve(file,"index.html");
    if(!existsSync(file)||!statSync(file).isFile()){
      if(extname(pathname)){json(res,404,{error:"文件不存在"});return;}
      file=resolve(publicDir,"index.html");
    }
    if(!existsSync(file)){json(res,503,{error:"前端文件尚未构建"});return;}
    const types:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".gif":"image/gif",".woff2":"font/woff2",".webmanifest":"application/manifest+json"};
    res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream","X-Content-Type-Options":"nosniff","Cache-Control":extname(file)===".html"?"no-cache":"public, max-age=3600"});res.end(req.method==="HEAD"?undefined:readFileSync(file));
  }
  const server=createServer((req,res)=>{void handle(req,res).catch(error=>{console.error(error instanceof Error?error.message:error);if(!res.headersSent)json(res,500,{error:"保存失败，请检查服务器后重试"});else res.end();});});
  const port=Number(process.env.PORT||8080),host=process.env.HOST||"0.0.0.0";
  server.listen(port,host,()=>console.log(`Paper Wall: http://${host}:${port}`));
  const stop=()=>server.close(()=>{db.close();process.exit(0);});process.on("SIGINT",stop);process.on("SIGTERM",stop);
}
