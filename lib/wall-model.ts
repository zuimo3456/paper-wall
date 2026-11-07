import { z } from "zod";
const id = z.string().uuid();
const base = { id, title: z.string().trim().min(1, "请填写名称").max(120), archivedAt: z.number().int().nonnegative().nullable(), createdAt: z.number().int().nonnegative() };
export const todoSchema = z.object({ ...base, kind: z.literal("todo"), note: z.string().max(2000) }).strict();
export const paperSchema = z.object({
  ...base, kind: z.literal("paper"), note: z.string().max(2000), color: z.enum(["linen", "butter", "sage", "rose"]),
  x: z.number().finite().min(-3000).max(6000), y: z.number().finite().min(-3000).max(6000), tilt: z.number().finite().min(-5).max(5),
  stages: z.array(z.object({ id, text: z.string().trim().min(1).max(300), done: z.boolean() }).strict()).min(1).max(30),
}).strict();
export const itemSchema = z.discriminatedUnion("kind", [todoSchema, paperSchema]);
export const saveSchema = z.object({ item: itemSchema, revision: z.number().int().nonnegative() }).strict();
export type Todo = z.infer<typeof todoSchema>;
export type Paper = z.infer<typeof paperSchema>;
export type WallItem = z.infer<typeof itemSchema>;
export type SavedItem = WallItem & { revision: number; updatedAt: number };
export function withoutServerFields(item: SavedItem): WallItem {
  const { revision: _revision, updatedAt: _updatedAt, ...data } = item;
  return data;
}
