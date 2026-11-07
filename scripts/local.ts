// Local-only entry point. Production Wrangler configuration points directly to apps/api/worker.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync, spawn } from "node:child_process";
const test = process.argv.includes("--test");
const authTest = process.argv.includes("--auth-test");
const offline = process.argv.includes("--offline-test");
const port =
  process.env.STUDIO_PORT ||
  (authTest ? "8793" : test ? "8791" : offline ? "8792" : "8787");
const root = resolve(
  test || offline || authTest
    ? ".local/t" + crypto.randomUUID().slice(0, 6)
    : ".local/dev",
);
mkdirSync(root, { recursive: true });
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
config.main = resolve(
  authTest ? "scripts/auth-test-worker.ts" : "scripts/local-worker.ts",
);
config.assets.directory = resolve("dist");
config.d1_databases[0].migrations_dir = resolve("migrations");
config.vars = {
  LOCAL_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  TEST_PROVIDER: test ? "yes" : "no",
  ...(authTest
    ? {
        AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
        APP_ORIGIN: `http://127.0.0.1:${port}`,
      }
    : {}),
};
const path = resolve(root, "wrangler.json");
writeFileSync(path, JSON.stringify(config));
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const common = ["--config", path, "--persist-to", resolve(root, "state")];
function run(args: string[]) {
  const r = spawnSync(process.execPath, [wrangler, ...args], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
run(["d1", "migrations", "apply", "studio", "--local", ...common]);
run([
  "d1",
  "execute",
  "studio",
  "--local",
  ...common,
  "--command",
  "INSERT OR IGNORE INTO members VALUES('designer@local.test','designer',1),('admin@local.test','administrator',1)",
]);
const child = spawn(
  process.execPath,
  [wrangler, "dev", "--local", "--ip", "127.0.0.1", "--port", port, ...common],
  { stdio: "inherit" },
);
process.on("SIGTERM", () => child.kill());
child.on("exit", (code) => process.exit(code ?? 1));
