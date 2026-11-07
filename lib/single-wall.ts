import { env } from "cloudflare:workers";

// This site deliberately has one shared wall. Browser identities and cookies
// never select a different data partition. Reuse the existing owner's key so
// removing sign-in does not move, delete, or duplicate their saved records.
export function singleWallId(): string {
  if (import.meta.env.DEV) return "local_seedy";
  if (!env.WALL_OWNER_ID) throw new Error("WALL_OWNER_ID is not configured");
  return env.WALL_OWNER_ID;
}
