import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import * as schema from "./account-schema.ts";
import type { ContextEnv, Env, Identity } from "./types.ts";

export function accountAuth(env: Env, reset?: (token: string) => void) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || !env.APP_ORIGIN) {
    throw new HTTPException(503, {
      message: "Workspace sign-in is not configured yet.",
    });
  }
  return betterAuth({
    secret: env.AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    basePath: "/api/auth",
    trustedOrigins: [env.APP_ORIGIN],
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      sendResetPassword: async ({ token }) => {
        reset?.(token);
      },
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 8 * 3600,
      updateAge: 3600,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: "folio",
      useSecureCookies: env.APP_ORIGIN.startsWith("https://"),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      },
    },
    // Requests are rate-limited atomically in D1 by account and IP below.
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
}

export const accountIdentity: Identity = async (request, env) => {
  if (!env.AUTH_SECRET || !env.APP_ORIGIN) return null;
  const result = await accountAuth(env).api.getSession({
    headers: request.headers,
  });
  return result?.user.email.toLowerCase() ?? null;
};

export async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function createInvitation(env: Env, email: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  await env.DB.prepare(
    "INSERT INTO invitations(email,token_hash,expires,consumed) VALUES(?,?,?,NULL) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,consumed=NULL",
  )
    .bind(email, await tokenHash(token), Date.now() + 7 * 86400000)
    .run();
  return new URL(`/#join/${token}`, env.APP_ORIGIN).href;
}
export async function memberSetupLink(env: Env, email: string) {
  const existing = await env.DB.prepare(
    "SELECT id FROM auth_user WHERE email=?",
  )
    .bind(email)
    .first();
  if (!existing)
    return {
      url: await createInvitation(env, email),
      kind: "invitation",
      email,
    };
  let token = "";
  await accountAuth(env, (value) => {
    token = value;
  }).api.requestPasswordReset({ body: { email } });
  if (!token)
    throw new HTTPException(503, {
      message: "Could not create a recovery link.",
    });
  return {
    url: new URL(`/#reset/${token}`, env.APP_ORIGIN).href,
    kind: "recovery",
    email,
  };
}

const invitationInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
async function invitedEmail(env: Env, hash: string) {
  return env.DB.prepare(
    "SELECT i.email FROM invitations i JOIN members m ON m.email=i.email WHERE i.token_hash=? AND i.consumed IS NULL AND i.expires>? AND m.active=1",
  )
    .bind(hash, Date.now())
    .first<string>("email");
}
async function authAttempt(env: Env, request: Request) {
  const window = Math.floor(Date.now() / 60000);
  const address = await tokenHash(
    request.headers.get("cf-connecting-ip") || "local",
  );
  const increment = (key: string) =>
    env.DB.prepare(
      "INSERT INTO auth_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET used=CASE WHEN auth_limits.window=excluded.window THEN used+1 ELSE 1 END,window=excluded.window RETURNING used",
    ).bind(key, window);
  const result = await env.DB.batch<{ used: number }>([
    env.DB.prepare("DELETE FROM auth_limits WHERE window<?").bind(window - 60),
    increment("global"),
    increment(address),
  ]);
  return (
    Number(result[1].results[0]?.used) <= 100 &&
    Number(result[2].results[0]?.used) <= 15
  );
}

export function accountRoutes() {
  const app = new Hono<ContextEnv>();
  const gate: MiddlewareHandler<ContextEnv> = async (c, next) => {
    if (c.req.method !== "POST") return c.notFound();
    if (!c.env.APP_ORIGIN || c.req.header("origin") !== c.env.APP_ORIGIN)
      return c.json({ error: "Same-origin requests required." }, 403);
    if (!(await authAttempt(c.env, c.req.raw)))
      return c.json(
        { error: "Too many sign-in attempts. Wait one minute and try again." },
        429,
      );
    await next();
  };
  for (const prefix of ["/auth/*", "/invitations/*"]) {
    app.use(prefix, bodyLimit({ maxSize: 16384 }));
    app.use(prefix, gate);
  }
  app.post("/invitations/check", async (c) => {
    const { token } = invitationInput.parse(await c.req.json());
    const email = await invitedEmail(c.env, await tokenHash(token));
    return email
      ? c.json({ email })
      : c.json(
          {
            error:
              "This invitation is expired, used or revoked. Ask an administrator for a new link.",
          },
          410,
        );
  });
  app.post("/invitations/accept", async (c) => {
    const input = invitationInput
      .extend({
        name: z.string().trim().min(1).max(80),
        password: z.string().min(12).max(128),
      })
      .parse(await c.req.json());
    const hash = await tokenHash(input.token),
      now = Date.now();
    const email = await c.env.DB.prepare(
      "UPDATE invitations SET consumed=? WHERE token_hash=? AND consumed IS NULL AND expires>? AND EXISTS(SELECT 1 FROM members WHERE members.email=invitations.email AND active=1) RETURNING email",
    )
      .bind(now, hash, now)
      .first<string>("email");
    if (!email)
      return c.json(
        { error: "This invitation is expired, used or revoked." },
        410,
      );
    try {
      const response = await accountAuth(c.env).api.signUpEmail({
        body: { name: input.name, email, password: input.password },
        headers: c.req.raw.headers,
        asResponse: true,
      });
      if (!response.ok) throw new Error("Sign-up rejected");
      return response;
    } catch {
      // Re-enable only if account creation did not happen. An ambiguous result stays consumed.
      await c.env.DB.prepare(
        "UPDATE invitations SET consumed=NULL WHERE token_hash=? AND consumed=? AND NOT EXISTS(SELECT 1 FROM auth_user WHERE email=?)",
      )
        .bind(hash, now, email)
        .run();
      return c.json(
        {
          error:
            "Could not create your account. Try signing in if setup already completed, or request a new invitation.",
        },
        409,
      );
    }
  });
  app.post("/auth/:action", async (c) => {
    if (
      !["sign-out", "reset-password", "change-password"].includes(
        c.req.param("action"),
      )
    )
      return c.notFound();
    return accountAuth(c.env).handler(c.req.raw);
  });
  app.post("/auth/sign-in/email", (c) => accountAuth(c.env).handler(c.req.raw));
  return app;
}
