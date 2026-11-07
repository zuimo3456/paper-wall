declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    WALL_OWNER_ID?: string;
    WALL_ALLOWED_ORIGINS?: string;
  }
}
