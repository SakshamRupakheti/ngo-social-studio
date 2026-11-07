import { createApp } from "./app.ts";
import { accountIdentity } from "./accounts.ts";
import { bufferProvider, runJobs } from "./publishing.ts";
import type { Env } from "./types.ts";
const app = createApp(accountIdentity, bufferProvider);
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env) {
    await runJobs(env, bufferProvider(env));
  },
};
