import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:8791",
    launchOptions: {
      ...(process.env.STUDIO_CHROME
        ? { executablePath: process.env.STUDIO_CHROME }
        : {}),
    },
  },
  webServer: [
    ["--test", 8791],
    ["--offline-test", 8792],
    ["--auth-test", 8793],
  ].map(([flag, port]) => ({
    command: "node scripts/local.ts " + flag,
    url: "http://127.0.0.1:" + port + "/api/entry",
    reuseExistingServer: false,
    timeout: 150000,
  })),
});
