import type { Env } from "./types.ts";
export async function allowWrite(env: Env, email: string, path: string) {
  const upload = path === "/api/media",
    sync = path === "/api/channels/sync";
  const duration = upload || sync ? 3600000 : 60000;
  const limit = upload ? 30 : sync ? 6 : 80;
  const used = await env.DB.prepare(`INSERT INTO request_limits VALUES(?,?,?,1)
 ON CONFLICT(email,operation) DO UPDATE SET used=CASE WHEN request_limits.window=excluded.window THEN used+1 ELSE 1 END,window=excluded.window RETURNING used`)
    .bind(
      email,
      upload ? "upload" : sync ? "sync" : "write",
      Math.floor(Date.now() / duration),
    )
    .first<number>("used");
  return used !== null && used <= limit;
}
