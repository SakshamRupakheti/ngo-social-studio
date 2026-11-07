// Run only as the deployment owner. Writes private setup material under ignored .local/.
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
const [emailArg, originArg, configArg] = process.argv.slice(2);
const email = z.email().parse(emailArg).toLowerCase();
const origin = new URL(z.url().parse(originArg));
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== "/"
)
  throw new Error("Supply the exact HTTPS workspace origin.");
if (!configArg) throw new Error("Supply the intended Wrangler config path.");
const config = resolve(configArg);
const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
mkdirSync(".local", { recursive: true });
const file = resolve(".local/bootstrap-invitation.sql");
writeFileSync(
  file,
  `INSERT INTO members(email,role,active) SELECT ${quote(email)},'administrator',1 WHERE NOT EXISTS(SELECT 1 FROM members);
INSERT INTO invitations(email,token_hash,expires,consumed)
SELECT email,${quote(hash)},${Date.now() + 86400000},NULL FROM members WHERE email=${quote(email)} AND role='administrator' AND active=1 AND NOT EXISTS(SELECT 1 FROM auth_user WHERE email=${quote(email)})
ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,consumed=NULL;
SELECT count(*) AS created FROM invitations WHERE token_hash=${quote(hash)};`,
  { mode: 0o600 },
);
const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "DB",
    "--remote",
    "--config",
    config,
    "--command",
    readFileSync(file, "utf8"),
    "--json",
  ],
  { encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error(
    "Administrator setup failed. Check the selected account, migrations and Wrangler authorization.",
  );
const records = JSON.parse(result.stdout) as {
  results: { created?: number }[];
}[];
if (!records.some((entry) => entry.results?.some((row) => row.created === 1)))
  throw new Error(
    "No setup link created. The administrator may already have an account or another owner is configured.",
  );
const destination = resolve(".local/admin-setup-link.txt");
writeFileSync(destination, new URL(`/#join/${token}`, origin).href + "\n", {
  mode: 0o600,
});
console.log(
  "Administrator setup link saved to " +
    destination +
    ". It expires in 24 hours and can be used once. Keep it private.",
);
