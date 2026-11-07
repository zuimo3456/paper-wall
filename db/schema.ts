import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
export const wallRecords = sqliteTable("wall_records", {
  userId: text("user_id").notNull(),
  id: text("id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.id] }), index("wall_records_user_updated").on(table.userId, table.updatedAt)]);
