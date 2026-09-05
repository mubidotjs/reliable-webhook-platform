import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const secretPrefix = "whsec_";
const secretByteLength = 32;
type WebhookBody = string | Buffer | Uint8Array;

export function createSigningSecret(): {
  bytes: Buffer;
  displayValue: string;
} {
  const bytes = randomBytes(secretByteLength);
  return { bytes, displayValue: formatSigningSecret(bytes) };
}

export function formatSigningSecret(bytes: Uint8Array): string {
  if (bytes.byteLength !== secretByteLength) {
    throw new Error("Signing secrets must contain exactly 32 bytes.");
  }
  return `${secretPrefix}${Buffer.from(bytes).toString("base64url")}`;
}

export function parseSigningSecret(value: string): Buffer {
  if (!value.startsWith(secretPrefix)) {
    throw new Error("Invalid signing secret prefix.");
  }
  const encoded = value.slice(secretPrefix.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("Invalid signing secret encoding.");
  }
  const bytes = Buffer.from(encoded, "base64url");
  if (
    bytes.byteLength !== secretByteLength ||
    bytes.toString("base64url") !== encoded
  ) {
    throw new Error("Invalid signing secret encoding.");
  }
  return bytes;
}

function signaturePayload(
  eventId: string,
  timestamp: number,
  rawBody: WebhookBody,
): Buffer {
  return Buffer.concat([
    Buffer.from(`${eventId}.${timestamp}.`, "utf8"),
    typeof rawBody === "string" ? Buffer.from(rawBody) : Buffer.from(rawBody),
  ]);
}

export function signWebhook(
  secret: Uint8Array,
  eventId: string,
  timestamp: number,
  rawBody: WebhookBody,
): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("Webhook timestamps must be non-negative Unix seconds.");
  }
  const digest = createHmac("sha256", secret)
    .update(signaturePayload(eventId, timestamp, rawBody))
    .digest("base64url");
  return `v1=${digest}`;
}

export function verifyWebhookSignature(
  secret: Uint8Array,
  eventId: string,
  timestamp: number,
  rawBody: WebhookBody,
  signature: string,
): boolean {
  try {
    const expected = Buffer.from(
      signWebhook(secret, eventId, timestamp, rawBody),
      "utf8",
    );
    const actual = Buffer.from(signature, "utf8");
    return (
      actual.byteLength === expected.byteLength &&
      timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
