import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { EncryptionKeyringConfig } from "@rwp/config";

const envelopeVersion = "gcm1";

export type SecretBinding = {
  workspaceId: string;
  endpointId: string;
  secretVersion: number;
};

function additionalData(binding: SecretBinding): Buffer {
  return Buffer.from(
    `endpoint-secret:v1:${binding.workspaceId}:${binding.endpointId}:${binding.secretVersion}`,
    "utf8",
  );
}

export function encryptEndpointSecret(
  plaintext: Uint8Array,
  binding: SecretBinding,
  keyring: EncryptionKeyringConfig,
): { encryptedSecret: string; encryptionKeyVersion: string } {
  if (plaintext.byteLength !== 32) {
    throw new Error("Endpoint signing secrets must contain exactly 32 bytes.");
  }
  const key = keyring.keys.get(keyring.activeVersion);
  if (!key) {
    throw new Error("The active endpoint encryption key is unavailable.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(additionalData(binding));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedSecret: [
      envelopeVersion,
      nonce.toString("base64url"),
      ciphertext.toString("base64url"),
      tag.toString("base64url"),
    ].join("."),
    encryptionKeyVersion: keyring.activeVersion,
  };
}

export function decryptEndpointSecret(
  envelope: string,
  encryptionKeyVersion: string,
  binding: SecretBinding,
  keyring: EncryptionKeyringConfig,
): Buffer {
  const key = keyring.keys.get(encryptionKeyVersion);
  if (!key) {
    throw new Error(`Encryption key ${encryptionKeyVersion} is unavailable.`);
  }
  const [version, nonceValue, ciphertextValue, tagValue, extra] =
    envelope.split(".");
  if (
    version !== envelopeVersion ||
    !nonceValue ||
    !ciphertextValue ||
    !tagValue ||
    extra
  ) {
    throw new Error("Invalid encrypted endpoint secret envelope.");
  }
  const nonce = Buffer.from(nonceValue, "base64url");
  const ciphertext = Buffer.from(ciphertextValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  if (nonce.byteLength !== 12 || tag.byteLength !== 16) {
    throw new Error("Invalid encrypted endpoint secret envelope.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
    authTagLength: 16,
  });
  decipher.setAAD(additionalData(binding));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  if (plaintext.byteLength !== 32) {
    throw new Error("Invalid endpoint signing secret length.");
  }
  return plaintext;
}
