import { describe, expect, it } from "vitest";

import type { EncryptionKeyringConfig } from "@rwp/config";

import {
  decryptEndpointSecret,
  encryptEndpointSecret,
  type SecretBinding,
} from "./secret-crypto";

const keyring: EncryptionKeyringConfig = {
  activeVersion: "v1",
  keys: new Map([
    ["v1", Buffer.alloc(32, 1)],
    ["old", Buffer.alloc(32, 2)],
  ]),
};
const binding: SecretBinding = {
  workspaceId: "workspace-1",
  endpointId: "endpoint-1",
  secretVersion: 1,
};

describe("endpoint secret encryption", () => {
  it("round-trips a 32-byte secret without storing plaintext", () => {
    const secret = Buffer.alloc(32, 9);
    const encrypted = encryptEndpointSecret(secret, binding, keyring);
    expect(encrypted.encryptedSecret).not.toContain(
      secret.toString("base64url"),
    );
    expect(
      decryptEndpointSecret(
        encrypted.encryptedSecret,
        encrypted.encryptionKeyVersion,
        binding,
        keyring,
      ),
    ).toEqual(secret);
  });

  it("rejects tampering, a wrong binding, and a missing key version", () => {
    const encrypted = encryptEndpointSecret(
      Buffer.alloc(32, 9),
      binding,
      keyring,
    );
    const parts = encrypted.encryptedSecret.split(".");
    const tag = parts[3]!;
    parts[3] = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;
    expect(() =>
      decryptEndpointSecret(parts.join("."), "v1", binding, keyring),
    ).toThrow();
    expect(() =>
      decryptEndpointSecret(
        encrypted.encryptedSecret,
        "v1",
        { ...binding, secretVersion: 2 },
        keyring,
      ),
    ).toThrow();
    expect(() =>
      decryptEndpointSecret(
        encrypted.encryptedSecret,
        "missing",
        binding,
        keyring,
      ),
    ).toThrow(/unavailable/);
  });
});
