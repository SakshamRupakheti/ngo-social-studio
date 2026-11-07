// Test-only bootstrap. This module is never imported by the production Worker.
import worker from "../apps/api/worker.ts";
import { createInvitation } from "../apps/api/accounts.ts";
import type { Env } from "../apps/api/types.ts";
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      return new Response("Local test only", { status: 403 });
    if (url.pathname === "/local/test/bootstrap") {
      return Response.json({
        url: await createInvitation(env, "admin@local.test"),
      });
    }
    return worker.fetch(request, env, ctx);
  },
};
