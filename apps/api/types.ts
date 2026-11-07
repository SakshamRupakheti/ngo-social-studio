import type { User } from "../../packages/shared/model.ts";
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN?: string;
  AUTH_SECRET?: string;
  BUFFER_API_KEY?: string;
  BUFFER_ORG_ID?: string;
  MEDIA_ORIGIN?: string;
}
export type Identity = (request: Request, env: Env) => Promise<string | null>;
export type ContextEnv = { Bindings: Env; Variables: { user: User } };
export async function rows<T>(
  db: D1Database,
  sql: string,
  ...args: (string | number | null)[]
) {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
