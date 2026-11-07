import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = process.env.WALL_TEST_URL || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("This script tests the local preview only.");
const signin = await fetch(`${origin}/signin-with-chatgpt?return_to=%2F`, { redirect: "manual" });
const cookie = signin.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "local sign-in cookie");
let passed = 0;
async function check(label, fn) { await fn(); passed++; console.log(`PASS ${label}`); }
async function request(method, body, extra = {}, authenticated = true) {
  return fetch(`${origin}/api/items`, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const makeTodo = title => ({ id: randomUUID(), kind: "todo", title, note: "", createdAt: Date.now(), archivedAt: null });
const createdIds = new Set();
const todo = makeTodo("API验收：并发与持久化");
await check("anonymous read rejected", async () => assert.equal((await request("GET", null, {}, false)).status, 401));
await check("anonymous write rejected", async () => assert.equal((await request("PUT", { item: todo, revision: 0 }, {}, false)).status, 401));
await check("spoofed identity rejected by local boundary", async () => assert.equal((await request("GET", null, { "oai-authenticated-user-id": "spoof", "oai-authenticated-user-email": "spoof@example.invalid" }, false)).status, 401));
await check("create starts at revision one", async () => { const r = await request("PUT", { item: todo, revision: 0 }); assert.equal(r.status, 200); const d = await r.json(); assert.equal(d.item.revision, 1); createdIds.add(todo.id); });
await check("same-account second session reads saved data", async () => { const session2 = await fetch(`${origin}/signin-with-chatgpt?return_to=%2F`, { redirect: "manual" }); const cookie2 = session2.headers.get("set-cookie").split(";")[0]; const d = await (await fetch(`${origin}/api/items`, { headers: { Cookie: cookie2 } })).json(); assert.ok(d.items.some(i => i.id === todo.id && i.title === todo.title)); });
await check("simultaneous edits: one succeeds, one conflicts", async () => { const results = await Promise.all([request("PUT", { item: { ...todo, title: "API验收：并发A" }, revision: 1 }), request("PUT", { item: { ...todo, title: "API验收：并发B" }, revision: 1 })]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); });
await check("duplicate create cannot overwrite", async () => assert.equal((await request("PUT", { item: todo, revision: 0 })).status, 409));
await check("cross-origin write rejected", async () => assert.equal((await request("PUT", { item: todo, revision: 2 }, { Origin: "https://other.example" })).status, 403));
await check("title length validated", async () => assert.equal((await request("PUT", { item: makeTodo("x".repeat(121)), revision: 0 })).status, 400));
const paper = { ...makeTodo("API验收：流程纸"), kind: "paper", color: "sage", x: 510, y: 100, tilt: -1, stages: [{ id: randomUUID(), text: "第一步", done: false }, { id: randomUUID(), text: "第二步", done: false }] };
await check("empty stages rejected", async () => assert.equal((await request("PUT", { item: { ...paper, stages: [] }, revision: 0 })).status, 400));
await check("invalid coordinates rejected", async () => assert.equal((await request("PUT", { item: { ...paper, x: 999999 }, revision: 0 })).status, 400));
await check("stage status and position persist", async () => { const r = await request("PUT", { item: paper, revision: 0 }); assert.equal(r.status, 200); createdIds.add(paper.id); const updated = { ...paper, x: 620, y: 220, stages: paper.stages.map((s, i) => ({ ...s, done: i === 0 })) }; assert.equal((await request("PUT", { item: updated, revision: 1 })).status, 200); const d = await (await request("GET")).json(); const saved = d.items.find(i => i.id === paper.id); assert.equal(saved.x, 620); assert.equal(saved.y, 220); assert.deepEqual(saved.stages.map(s => s.done), [true, false]); });
await check("archive retains payload and restore works", async () => { const d = await (await request("GET")).json(); const current = d.items.find(i => i.id === paper.id); const { revision, updatedAt, ...item } = current; assert.equal((await request("PUT", { item: { ...item, archivedAt: Date.now() }, revision })).status, 200); const archivedData = await (await request("GET")).json(); const archived = archivedData.items.find(i => i.id === paper.id); assert.ok(archived.archivedAt); assert.equal(archived.stages[0].done, true); const { revision: rev, updatedAt: at, ...old } = archived; assert.equal((await request("PUT", { item: { ...old, archivedAt: null }, revision: rev })).status, 200); });
await check("payload limit enforced", async () => { const r = await fetch(`${origin}/api/items`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: " ".repeat(24001) }); assert.equal(r.status, 413); });
console.log(JSON.stringify({ passed, localTestIds: [...createdIds] }));
