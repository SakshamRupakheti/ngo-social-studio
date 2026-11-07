import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:8793";
const password = "fixture-only-long-passphrase-31!";
test.use({
  baseURL: origin,
  extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.10" },
});

test("invited accounts sign in, recover, and lose access when revoked", async ({
  page,
  browser,
}) => {
  const bootstrap = await (
    await page.request.get("/local/test/bootstrap")
  ).json();
  await page.goto(bootstrap.url);
  await page.getByLabel("Your name").fill("Test Administrator");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) =>
    cookie.name.endsWith("folio.session_token"),
  );
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  const replay = await page.request.post("/api/invitations/accept", {
    headers: { origin },
    data: {
      token: new URL(bootstrap.url).hash.split("/")[1],
      name: "Replay",
      password,
    },
  });
  expect(replay.status()).toBe(410);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Member email").fill("teammate@local.test");
  await page.getByRole("button", { name: "Grant access" }).click();
  const invitation = page.getByLabel("Private invitation link");
  await expect(invitation).toBeVisible();
  const url = await invitation.inputValue();
  const teammate = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.11" },
  });
  const member = await teammate.newPage();
  await member.goto(url);
  await member.getByLabel("Your name").fill("Test Teammate");
  await member.getByLabel("Password", { exact: true }).fill(password);
  await member.getByLabel("Confirm password").fill(password);
  await member.getByRole("button", { name: "Create my account" }).click();
  await expect(member.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(
    (
      await teammate.request.post("/api/members", {
        headers: { origin },
        data: { email: "intruder@local.test", role: "administrator" },
      })
    ).status(),
  ).toBe(403);

  const recovery = await (
    await page.request.post("/api/members/setup-link", {
      headers: { origin },
      data: { email: "teammate@local.test" },
    })
  ).json();
  await member.goto(recovery.url);
  await member
    .getByLabel("New password", { exact: true })
    .fill(password + "new");
  await member.getByLabel("Confirm password").fill(password + "new");
  await member.getByRole("button", { name: "Save new password" }).click();
  await expect(
    member.getByRole("heading", { name: "Editorial sign-in" }),
  ).toBeVisible();
  expect(
    (
      await teammate.request.post("/api/auth/reset-password", {
        headers: { origin },
        data: {
          token: new URL(recovery.url).hash.split("/")[1],
          newPassword: password,
        },
      })
    ).ok(),
  ).toBe(false);
  await member.getByLabel("Email", { exact: true }).fill("teammate@local.test");
  await member.getByLabel("Password", { exact: true }).fill(password + "new");
  await member.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(member.getByRole("heading", { name: "Overview" })).toBeVisible();

  expect(
    (
      await page.request.post("/api/members", {
        headers: { origin },
        data: { email: "teammate@local.test", role: "designer", active: false },
      })
    ).ok(),
  ).toBe(true);
  expect((await teammate.request.get("/api/workspace")).status()).toBe(401);
  await page.getByRole("link", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Editorial sign-in" }),
  ).toBeVisible();
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  await teammate.close();
});

test("public registration, cross-origin login and repeated attempts are denied", async ({
  request,
}) => {
  const headers = { origin, "cf-connecting-ip": "203.0.113.12" };
  const registration = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { email: "stranger@local.test", name: "Stranger", password },
  });
  expect(registration.ok()).toBe(false);
  expect(
    (
      await request.post("/api/auth/sign-in/email", {
        headers: { ...headers, origin: "https://outside.example" },
        data: { email: "admin@local.test", password },
      })
    ).status(),
  ).toBe(403);
  const results = [];
  for (let i = 0; i < 16; i++)
    results.push(
      (
        await request.post("/api/invitations/check", {
          headers,
          data: { token: "0".repeat(64) },
        })
      ).status(),
    );
  expect(results).toContain(410);
  expect(results.at(-1)).toBe(429);
});
