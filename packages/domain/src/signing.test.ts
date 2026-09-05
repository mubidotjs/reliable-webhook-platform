import { describe, expect, it } from "vitest";

import {
  formatSigningSecret,
  parseSigningSecret,
  signWebhook,
  verifyWebhookSignature,
} from "./signing";

describe("webhook signing", () => {
  const secret = Buffer.from(
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    "hex",
  );

  it("round-trips the show-once secret representation", () => {
    const display = formatSigningSecret(secret);
    expect(display).toBe("whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
    expect(parseSigningSecret(display)).toEqual(secret);
  });

  it("matches the deterministic v1 signature vector", () => {
    const signature = signWebhook(
      secret,
      "evt_01HZX3K8M8",
      1_725_000_000,
      '{"type":"invoice.paid"}',
    );
    expect(signature).toBe("v1=omZcTTBuJJnULdTyA-qozSZy5vVKVPYyakdi4c4TZ4g");
    expect(
      verifyWebhookSignature(
        secret,
        "evt_01HZX3K8M8",
        1_725_000_000,
        '{"type":"invoice.paid"}',
        signature,
      ),
    ).toBe(true);
  });

  it("rejects malformed and changed signatures", () => {
    expect(verifyWebhookSignature(secret, "evt_1", 1, "{}", "v1=short")).toBe(
      false,
    );
    expect(() => parseSigningSecret("whsec_not-canonical")).toThrow();
  });
});
