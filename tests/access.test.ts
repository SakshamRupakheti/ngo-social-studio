import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { it, expect, vi, afterEach } from "vitest";
import { identity } from "../apps/api/auth.ts";
import type { Env } from "../apps/api/types.ts";
afterEach(() => vi.unstubAllGlobals());
it("verifies Access signatures, audience, issuer and expiry against a test JWKS", async () => {
  const issuer = "https://unit-test.cloudflareaccess.com",
    audience = "studio";
  const keys = await generateKeyPair("RS256"),
    wrong = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    alg: "RS256",
    kid: "test",
  };
  vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));
  const env = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: audience } as Env;
  async function verify(
    aud: string,
    iss: string,
    exp: number,
    key = keys.privateKey,
  ) {
    const token = await new SignJWT({ email: "Designer@example.org" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(iss)
      .setSubject("unit-subject")
      .setAudience(aud)
      .setExpirationTime(exp)
      .sign(key);
    return identity(
      new Request("https://unit.example", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
    );
  }
  const future = Math.floor(Date.now() / 1000) + 1800;
  expect(await verify(audience, issuer, future)).toBe("designer@example.org");
  expect(await verify("another-app", issuer, future)).toBeNull();
  expect(await verify(audience, "https://wrong.example", future)).toBeNull();
  expect(await verify(audience, issuer, 1)).toBeNull();
  expect(await verify(audience, issuer, future, wrong.privateKey)).toBeNull();
});
