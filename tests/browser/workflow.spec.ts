import { gardenGraphic } from "./graphic.ts";
import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import type { Workspace } from "../../packages/shared/model.ts";
const origin = "http://127.0.0.1:8791";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pK+0AAAAASUVORK5CYII=",
  "base64",
);
const headers = { origin };
async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("Preview role").selectOption(role);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
}
async function workspace(api: APIRequestContext): Promise<Workspace> {
  return (await api.get("/api/workspace")).json();
}
async function post(api: APIRequestContext, path: string, data: unknown = {}) {
  return api.post(path, { data, headers });
}
test("designer draft, approval boundary, scheduled jobs and mixed delivery", async ({
  page,
  browser,
}) => {
  await login(page, "designer");
  await page
    .getByRole("link", { name: "Create post", exact: true })
    .first()
    .click();
  await page.getByLabel("Upload graphic").setInputFiles({
    name: "field-note.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("button", { name: "Replace graphic" }),
  ).toBeEnabled();
  for (const name of ["LinkedIn", "Instagram", "Facebook"])
    await page.locator(".choices button").filter({ hasText: name }).click();
  const caption = "Community garden " + crypto.randomUUID().slice(0, 8);
  await page.getByLabel("Caption", { exact: true }).fill(caption);
  await page
    .locator(".form-sheet .tabs")
    .getByRole("button", { name: "Instagram" })
    .click();
  await page
    .getByLabel("Caption", { exact: true })
    .fill("[reject] Revised caption for Instagram");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Post details" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".copy").first()).toHaveText(caption);
  await expect(page.getByAltText("Post graphic")).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.locator(".page-head .badge")).toHaveText(
    "Awaiting approval",
  );
  const id = page.url().split("/").pop()!;
  expect(
    (
      await post(page.request, "/api/posts/" + id + "/action", {
        action: "publish",
        revision: 2,
      })
    ).status(),
  ).toBe(403);
  const admin = await browser.newPage({ baseURL: origin });
  await login(admin, "administrator");
  await admin.getByRole("link", { name: "Settings", exact: true }).click();
  await admin.getByRole("button", { name: "Sync channels" }).click();
  await expect(admin.getByText("Test linkedin", { exact: true })).toBeVisible();
  await admin.goto("/#post/" + id);
  await admin.getByRole("button", { name: "Approve post" }).click();
  await expect(admin.locator(".page-head .badge")).toHaveText("Approved");
  const future = new Date(Date.now() + 7200000);
  const iso = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await admin.getByLabel(/Schedule in/).fill(iso);
  await admin.getByRole("button", { name: "Schedule post" }).click();
  await expect(admin.locator(".delivery")).toHaveCount(3);
  const w = await workspace(admin.request);
  const approved = w.posts.find((p) => p.id === id)!;
  expect(approved.jobs.every((j) => j.state === "queued")).toBeTruthy();
  expect(
    (
      await post(admin.request, "/api/posts/" + id + "/action", {
        action: "schedule",
        revision: approved.revision - 1,
        due: future.getTime(),
      })
    ).status(),
  ).toBe(409);
  await post(admin.request, "/local/test/tick");
  await admin.reload();
  await expect(admin.locator(".page-head .badge")).toHaveText(
    "Partial failure",
  );
  await expect(admin.locator(".delivery .scheduled")).toHaveCount(2);
  await expect(admin.locator(".delivery .failed")).toHaveCount(1);
  const result = (await workspace(admin.request)).posts.find(
    (p) => p.id === id,
  )!;
  expect(result.jobs.filter((j) => j.external_id)).toHaveLength(2);
  for (const job of result.jobs.filter((j) => j.external_id))
    await post(admin.request, "/local/test/poll/" + job.id);
  await admin.reload();
  await expect(admin.locator(".delivery .published")).toHaveCount(2);
  await expect(admin.locator(".delivery .failed")).toHaveCount(1);
  await expect(admin.locator(".page-head .badge")).toHaveText(
    "Partial failure",
  );
  await admin.close();
});
test("unsupported and oversized graphics and cross-origin mutations are rejected", async ({
  page,
}) => {
  await login(page, "designer");
  for (const [data, mime, code] of [
    [Buffer.from("<svg/>"), "image/svg+xml", 415],
    [Buffer.from("bad"), "image/png", 422],
    [Buffer.alloc(5242881), "image/png", 413],
  ] as const) {
    const res = await page.request.post("/api/media", {
      headers: { origin, "content-type": mime },
      data,
    });
    expect(res.status()).toBe(code);
  }
  expect(
    (
      await page.request.post("/api/posts", {
        headers: { origin: "https://outside.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
test("ambiguous handoff cannot be duplicated and accepted successes survive", async ({
  page,
}) => {
  await login(page, "administrator");
  const api = page.request;
  await post(api, "/api/channels/sync");
  const media = await (
    await api.post("/api/media", {
      headers: { origin, "content-type": "image/png" },
      data: png,
    })
  ).json();
  const id = crypto.randomUUID(),
    path = "/api/posts/" + id + "/action";
  await post(api, "/api/posts", {
    id,
    caption: "Public notice",
    media_id: media.id,
    variants: { linkedin: "", instagram: "[timeout]", facebook: "" },
  });
  for (const [index, action] of ["submit", "approve", "publish"].entries())
    expect(
      (await post(api, path, { action, revision: index + 1 })).ok(),
    ).toBeTruthy();
  await Promise.all([
    post(api, "/local/test/tick"),
    post(api, "/local/test/tick"),
  ]);
  const p = (await workspace(api)).posts.find((p) => p.id === id)!;
  expect(p.jobs.map((j) => j.state).sort()).toEqual([
    "published",
    "published",
    "unknown",
  ]);
  const unknown = p.jobs.find((j) => j.state === "unknown")!;
  expect((await post(api, "/api/jobs/" + unknown.id + "/retry")).status()).toBe(
    409,
  );
  await post(api, "/local/test/tick");
  const after = (await workspace(api)).posts.find((p) => p.id === id)!;
  expect(after.jobs).toEqual(p.jobs);
});
test("responsive workspace and keyboard navigation", async ({ page }) => {
  await login(page, "designer");
  for (const [width, height] of [
    [1440, 960],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/#overview");
    await expect(
      page.getByRole("heading", { name: "Publishing pipeline" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    if (process.env.STUDIO_SCREENSHOTS)
      await page.screenshot({
        path: "docs/screens/overview-" + width + ".png",
        fullPage: true,
      });
    await page.goto("/#create");
    if (process.env.STUDIO_SCREENSHOTS && width === 1440) {
      await page
        .getByLabel("Upload graphic")
        .setInputFiles(await gardenGraphic(page));
      await expect(
        page.getByRole("button", { name: "Replace graphic" }),
      ).toBeEnabled();
      await page
        .locator(".choices button")
        .filter({ hasText: "LinkedIn" })
        .click();
      await page
        .getByLabel("Caption", { exact: true })
        .fill(
          "Join our volunteers for a morning of planting and tending the community garden.",
        );
    }
    await expect(
      page.getByRole("heading", { name: "Post preview" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    if (process.env.STUDIO_SCREENSHOTS)
      await page.screenshot({
        path: "docs/screens/composer-" + width + ".png",
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "Toggle navigation" }).press("Enter");
  await page.getByRole("link", { name: "Drafts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drafts" })).toBeVisible();
});

test("approval invalidation, scoped media delivery, cancellation and reconciliation", async ({
  page,
  browser,
}) => {
  await login(page, "administrator");
  const api = page.request;
  await post(api, "/api/channels/sync");
  const media = await (
    await api.post("/api/media", {
      headers: { origin, "content-type": "image/png" },
      data: png,
    })
  ).json();
  const anonymous = await browser.newPage({ baseURL: origin });
  expect((await anonymous.request.get("/api/media/" + media.id)).status()).toBe(
    401,
  );
  const id = crypto.randomUUID(),
    path = "/api/posts/" + id + "/action";
  const draft = {
    id,
    caption: "Original approved caption",
    variants: { linkedin: "" },
    media_id: media.id,
  };
  await post(api, "/api/posts", draft);
  for (const [i, action] of ["submit", "approve"].entries())
    expect(
      (await post(api, path, { action, revision: i + 1 })).ok(),
    ).toBeTruthy();
  expect(
    (
      await post(api, "/api/posts", {
        ...draft,
        caption: "Edited",
        revision: 3,
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (await post(api, path, { action: "publish", revision: 4 })).status(),
  ).toBe(409);
  for (const [i, action] of ["submit", "approve", "schedule"].entries())
    expect(
      (
        await post(api, path, {
          action,
          revision: 4 + i,
          due: Date.now() + 86400000,
        })
      ).ok(),
    ).toBeTruthy();
  const current = async () =>
    (await workspace(api)).posts.find((p) => p.id === id)!;
  const job = (await current()).jobs[0],
    { url } = await (await api.get("/local/test/receipt/" + job.id)).json();
  expect((await anonymous.request.get(url)).status()).toBe(404);
  await post(api, "/local/test/tick");
  const delivered = await anonymous.request.get(url);
  expect(delivered.status()).toBe(200);
  expect(delivered.headers()["content-type"]).toBe("image/png");
  expect(await delivered.body()).toEqual(png);
  expect(
    (await post(api, "/api/jobs/" + job.id + "/cancel")).ok(),
  ).toBeTruthy();
  expect((await current()).state).toBe("cancelled");
  expect((await anonymous.request.get(url)).status()).toBe(404);
  const revision = (await current()).revision;
  await post(api, "/api/posts", { ...draft, revision });
  for (const [i, action] of ["submit", "approve", "schedule"].entries())
    await post(api, path, {
      action,
      revision: revision + 1 + i,
      due: Date.now() + 86400000,
    });
  await post(api, "/local/test/tick");
  const later = (await current()).jobs.find((j) => j.state === "scheduled")!;
  await post(api, "/local/test/poll/" + later.id);
  expect((await current()).jobs.find((j) => j.id === later.id)?.state).toBe(
    "published",
  );
  await anonymous.close();
});

test("credential-free preview supports draft approval and disables live publishing", async ({
  browser,
}) => {
  const page = await browser.newPage({ baseURL: "http://127.0.0.1:8792" });
  await login(page, "administrator");
  const api = page.request,
    offlineOrigin = "http://127.0.0.1:8792";
  expect((await workspace(api)).configured).toBe(false);
  const media = await (
    await api.post("/api/media", {
      headers: { origin: offlineOrigin, "content-type": "image/png" },
      data: png,
    })
  ).json();
  const id = crypto.randomUUID(),
    path = "/api/posts/" + id + "/action";
  const write = (path: string, data: unknown) =>
    api.post(path, { headers: { origin: offlineOrigin }, data });
  expect(
    (
      await write("/api/posts", {
        id,
        caption: "Offline draft",
        media_id: media.id,
        variants: { linkedin: "" },
      })
    ).ok(),
  ).toBeTruthy();
  await write(path, { action: "submit", revision: 1 });
  await write(path, { action: "approve", revision: 2 });
  await page.goto("/#post/" + id);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Publish now" }),
  ).toBeDisabled();
  expect((await write(path, { action: "publish", revision: 3 })).status()).toBe(
    503,
  );
  expect((await workspace(api)).posts[0].jobs).toHaveLength(0);
  await page.getByRole("link", { name: "Sign out" }).click();
  await expect(page.getByLabel("Preview role")).toBeVisible();
  expect((await api.get("/api/workspace")).status()).toBe(401);
  await page.close();
});
