import { parseSigned } from "hono/utils/cookie";
import { Hono } from "hono";
import { setSignedCookie, deleteCookie } from "hono/cookie";
import { createApp } from "../apps/api/app.ts";
import {
  type Provider,
  runJobs,
  ProviderError,
} from "../apps/api/publishing.ts";
import type { Env } from "../apps/api/types.ts";
import { platforms } from "../packages/shared/model.ts";
type LocalEnv = Env & { LOCAL_SECRET: string; TEST_PROVIDER: string };
const app = new Hono<{ Bindings: LocalEnv }>();
app.use("*", async (c, next) => {
  if (!["127.0.0.1", "localhost"].includes(new URL(c.req.url).hostname))
    return c.text("Local preview requires loopback.", 403);
  if (
    c.req.method === "POST" &&
    c.req.header("origin") !== new URL(c.req.url).origin
  )
    return c.text("Origin rejected", 403);
  await next();
});
app.post("/local/sign-in", async (c) => {
  const { role } = await c.req.json();
  if (!["designer", "administrator"].includes(role))
    return c.text("Invalid role", 400);
  await setSignedCookie(
    c,
    "local_session",
    JSON.stringify({
      email: role === "designer" ? "designer@local.test" : "admin@local.test",
      expires: Date.now() + 3600000,
    }),
    c.env.LOCAL_SECRET,
    {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 3600,
      secure: false,
    },
  );
  return c.json({ ok: true });
});
app.get("/local/logout", (c) => {
  deleteCookie(c, "local_session", { path: "/" });
  return c.redirect("/");
});
const fixture: Provider = {
  async channels() {
    return platforms.map((platform) => ({
      platform,
      name: "Test " + platform,
      external_id: "test-" + platform,
    }));
  },
  async create(j) {
    if (j.caption.includes("[timeout]"))
      throw new Error("Simulated ambiguous response");
    if (j.platform === "instagram" && j.caption.includes("[reject]"))
      throw new ProviderError("Test adapter rejected this caption.", true);
    return { id: "test-" + j.id, status: j.due ? "scheduled" : "sent" };
  },
  async cancel() {
    /* Test-only provider accepts cancellation. */
  },
  async lookup(id) {
    return { id, status: "sent" };
  },
};
app.get("/local/test/receipt/:id", async (c) => {
  if (c.env.TEST_PROVIDER !== "yes") return c.notFound();
  const token = await c.env.DB.prepare("SELECT token FROM jobs WHERE id=?")
    .bind(c.req.param("id"))
    .first<string>("token");
  return c.json({ url: "/delivery/" + token });
});
app.post("/local/test/poll/:id", async (c) => {
  if (c.env.TEST_PROVIDER !== "yes") return c.notFound();
  await c.env.DB.prepare(
    "UPDATE jobs SET next_check=0 WHERE id=? AND external_id IS NOT NULL",
  )
    .bind(c.req.param("id"))
    .run();
  await runJobs(c.env, fixture);
  return c.json({ ok: true });
});
app.post("/local/test/tick", async (c) => {
  if (c.env.TEST_PROVIDER !== "yes") return c.notFound();
  await runJobs(c.env, fixture);
  return c.json({ ok: true });
});
app.route(
  "/",
  createApp(
    async (req, env) => {
      const cookies = await parseSigned(
        req.headers.get("cookie") || "",
        (env as LocalEnv).LOCAL_SECRET,
        "local_session",
      );
      const cookie = cookies.local_session;
      if (typeof cookie !== "string") return null;
      const value = JSON.parse(cookie) as { expires: number; email: string };
      return value.expires && value.expires > Date.now()
        ? value.email || null
        : null;
    },
    (env) => ((env as LocalEnv).TEST_PROVIDER === "yes" ? fixture : null),
    true,
  ),
);
export default { fetch: app.fetch };
