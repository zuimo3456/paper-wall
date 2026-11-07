import { singleWallId } from "../../../lib/single-wall";
import { getDb } from "../../../db";
import { wallRecords } from "../../../db/schema";
import { and, eq, desc } from "drizzle-orm";
import { saveSchema } from "../../../lib/wall-model";
import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
const baseHeaders = { "Cache-Control": "private, no-store" };
function cors(request:Request){
  const origin=request.headers.get("origin");
  const allowed=new Set((env.WALL_ALLOWED_ORIGINS||"").split(",").map(value=>value.trim()).filter(Boolean));
  const permitted=!origin||origin===new URL(request.url).origin||allowed.has(origin);
  const headers:Record<string,string>={...baseHeaders};
  if(origin&&allowed.has(origin))Object.assign(headers,{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, PUT, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"});
  return {permitted,headers};
}
export function OPTIONS(request:Request){const {permitted,headers}=cors(request);return permitted?new Response(null,{status:204,headers}):Response.json({error:"请求来源不匹配"},{status:403,headers});}
function serialize(row: typeof wallRecords.$inferSelect) { return { ...JSON.parse(row.payload), revision: row.revision, updatedAt: row.updatedAt }; }
export async function GET(request:Request) {
  const {headers}=cors(request);
  try {
    const rows = await getDb().select().from(wallRecords).where(eq(wallRecords.userId, singleWallId())).orderBy(desc(wallRecords.updatedAt));
    return Response.json({ items: rows.map(serialize) }, { headers });
  } catch (e) {
    console.error("Wall read failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "暂时无法读取墙面，请稍后重试" }, { status: 503, headers });
  }
}
export async function PUT(request: Request) {
  const {permitted,headers}=cors(request);
  if (!permitted) return Response.json({ error: "请求来源不匹配" }, { status: 403, headers });
  let parsed;
  try {
    const raw = await request.text();
    if (raw.length > 24000) return Response.json({ error: "内容过长" }, { status: 413, headers });
    parsed = saveSchema.safeParse(JSON.parse(raw));
  } catch { return Response.json({ error: "无法识别提交内容" }, { status: 400, headers }); }
  if (!parsed.success) return Response.json({ error: "请检查名称、阶段内容与长度（最多30个阶段）" }, { status: 400, headers });
  const { item, revision } = parsed.data;
  try {
    const db = getDb();
    const wallId = singleWallId();
    const values = { kind: item.kind, payload: JSON.stringify(item), revision: revision + 1, updatedAt: Date.now() };
    const rows = revision === 0
      ? await db.insert(wallRecords).values({ ...values, userId: wallId, id: item.id }).onConflictDoNothing().returning()
      : await db.update(wallRecords).set(values).where(and(eq(wallRecords.userId, wallId), eq(wallRecords.id, item.id), eq(wallRecords.revision, revision), eq(wallRecords.kind, item.kind))).returning();
    if (!rows.length) return Response.json({ error: "另一端刚刚修改了这项内容，墙面已刷新。请核对后再操作。" }, { status: 409, headers });
    return Response.json({ item: serialize(rows[0]) }, { headers });
  } catch (e) {
    console.error("Wall save failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "保存失败，请检查网络后重试；本次操作尚未同步" }, { status: 503, headers });
  }
}
