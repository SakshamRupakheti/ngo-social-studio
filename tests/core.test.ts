import { describe, expect, it, vi, afterEach } from "vitest";
import {
  validateSubmission,
  status,
  type Media,
  type Post,
} from "../packages/shared/model.ts";
import {
  bufferProvider,
  providerState,
  type WorkJob,
} from "../apps/api/publishing.ts";
import { accountIdentity as identity } from "../apps/api/accounts.ts";
import { createApp } from "../apps/api/app.ts";
import { readGraphic } from "../apps/api/media.ts";
import type { Env } from "../apps/api/types.ts";
const env = {
  BUFFER_API_KEY: "fixture-only",
  BUFFER_ORG_ID: "org",
  MEDIA_ORIGIN: "https://media.example.org",
} as Env;
const work = {
  channel_id: "official-channel",
  caption: "Release",
  platform: "instagram",
  due: Date.now() + 3600000,
  token: "abc",
} as WorkJob;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pK+0AAAAASUVORK5CYII=",
  "base64",
);
afterEach(() => vi.unstubAllGlobals());
describe("approval validation", () => {
  it("requires media, a destination and a caption", () => {
    const media = { width: 600, height: 600 } as Media;
    expect(validateSubmission("Caption", { instagram: "" }, null)).toMatch(
      /graphic/,
    );
    expect(validateSubmission("Caption", {}, media)).toMatch(/platform/);
    expect(validateSubmission("", { instagram: "" }, media)).toMatch(/caption/);
    expect(validateSubmission("", { instagram: "edited" }, media)).toBe("");
  });
  it("accounts for Instagram line breaks and aspect ratios", () => {
    expect(
      validateSubmission("x\n".repeat(800), { instagram: "" }, {
        width: 640,
        height: 640,
      } as Media),
    ).toMatch(/character/);
    expect(
      validateSubmission("Hi", { instagram: "" }, {
        width: 400,
        height: 1600,
      } as Media),
    ).toMatch(/Instagram/);
  });
  it("uses the shared caption only for an empty platform override", () => {
    const media = { width: 600, height: 600 } as Media;
    expect(validateSubmission("Shared", { linkedin: "" }, media)).toBe("");
    expect(validateSubmission("Shared", { linkedin: " \n\t" }, media)).toBe(
      "Write a caption for LinkedIn.",
    );
  });
  it("counts surrounding whitespace in both shared and platform captions", () => {
    const media = { width: 600, height: 600 } as Media;
    const limit = "x".repeat(3000);
    expect(validateSubmission(limit, { linkedin: "" }, media)).toBe("");
    expect(validateSubmission(limit + " ", { linkedin: "" }, media)).toMatch(
      /character limit/,
    );
    expect(validateSubmission("", { linkedin: " " + limit }, media)).toMatch(
      /character limit/,
    );
  });
  it("keeps partial delivery distinguishable", () =>
    expect(
      status({
        state: "dispatch",
        jobs: [{ state: "published" }, { state: "failed" }],
      } as Post),
    ).toBe("partial"));
});
describe("worker boundary", () => {
  it("fails closed without account configuration and ignores asserted email headers", async () => {
    expect(
      await identity(
        new Request("https://example.org", {
          headers: {
            "cf-access-authenticated-user-email": "admin@example.org",
          },
        }),
        {} as Env,
      ),
    ).toBeNull();
    const app = createApp(identity, bufferProvider);
    expect((await app.request("/api/workspace", {}, {})).status).toBe(401);
    expect(
      (await app.request("/api/posts", { method: "POST" }, {})).status,
    ).toBe(403);
  });
  it("keeps Buffer unavailable without credentials", () =>
    expect(bufferProvider({} as Env)).toBeNull());
  it("validates image signature, dimensions and trailer", async () => {
    const read = (body: Buffer) =>
      readGraphic(
        new Request("https://example.org", {
          method: "POST",
          headers: { "content-type": "image/png" },
          body: new Uint8Array(body),
        }),
      );
    expect((await read(png)).width).toBe(1);
    await expect(read(png.subarray(0, 40))).rejects.toThrow(/truncated/);
    await expect(read(Buffer.from("<svg/>"))).rejects.toThrow();
  });
});
describe("Buffer wire contract using mocked HTTP", () => {
  it("submits the approved channel, UTC time, caption and stable image URL", async () => {
    const mock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          createPost: {
            __typename: "PostActionSuccess",
            post: { id: "p1", status: "scheduled" },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", mock);
    expect(await bufferProvider(env)?.create(work)).toEqual({
      id: "p1",
      status: "scheduled",
    });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("https://api.buffer.com");
    expect(init.headers.Authorization).toBe("Bearer fixture-only");
    expect(JSON.parse(init.body).variables.input).toMatchObject({
      channelId: "official-channel",
      text: "Release",
      dueAt: new Date(work.due!).toISOString(),
      mode: "customScheduled",
      assets: [{ image: { url: "https://media.example.org/delivery/abc" } }],
    });
  });
  it("distinguishes acceptance, errors and unconfirmed outcomes", () => {
    expect(providerState("scheduled")).toBe("scheduled");
    expect(providerState("sent")).toBe("published");
    expect(providerState("error")).toBe("failed");
    expect(providerState("new_status")).toBe("unknown");
  });
  it("honors a provider cooldown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
      ),
    );
    await expect(bufferProvider(env)?.create(work)).rejects.toMatchObject({
      safe: true,
      pause: 120000,
    });
  });
  it("does not retry ambiguous GraphQL responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ errors: [{ message: "internal" }] }),
        ),
    );
    await expect(bufferProvider(env)?.create(work)).rejects.toMatchObject({
      safe: false,
    });
  });
});
