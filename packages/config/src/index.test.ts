import { describe, expect, it } from "vitest";

import { parseEncryptionKeyring, parseServerEnvironment } from "./index";

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

  it("parses a canonical versioned encryption keyring", () => {
    const keyring = parseEncryptionKeyring({
      ENCRYPTION_KEY_VERSION: "v1",
      ENCRYPTION_KEY_V1: Buffer.alloc(32, 7).toString("base64url"),
    });
    expect(keyring.activeVersion).toBe("v1");
    expect(keyring.keys.get("v1")).toEqual(Buffer.alloc(32, 7));
  });

  it("rejects incorrectly sized active encryption keys", () => {
    expect(() =>
      parseEncryptionKeyring({
        ENCRYPTION_KEY_VERSION: "v1",
        ENCRYPTION_KEY_V1: Buffer.alloc(31).toString("base64url"),
      }),
    ).toThrow(/32-byte/);
  });
});
