import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "./index";

const validEnvironment = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
  DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/app",
  BETTER_AUTH_SECRET: "a-secure-development-secret-that-is-long",
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "github-client",
  GITHUB_CLIENT_SECRET: "github-secret",
};

describe("server environment", () => {
  it("applies safe local defaults", () => {
    expect(parseServerEnvironment(validEnvironment)).toMatchObject({
      QUEUE_ADAPTER: "local",
      LOG_LEVEL: "info",
    });
  });

  it("rejects short authentication secrets", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        BETTER_AUTH_SECRET: "too-short",
      }),
    ).toThrow();
  });
});
