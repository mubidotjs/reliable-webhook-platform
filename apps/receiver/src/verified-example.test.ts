import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  createVerifiedReceiver,
  verifyReceivedWebhook,
} from "./verified-example";
const key = Buffer.alloc(32, 7);
const secret = "whsec_" + key.toString("base64url");
const body = Buffer.from('{"message":"héllo"}');
const eventId = "evt-test";
const timestamp = String(Math.floor(Date.now() / 1000));
const sign = (time = timestamp, raw = body) =>
  "v1=" +
  createHmac("sha256", key)
    .update(eventId + "." + time + ".")
    .update(raw)
    .digest("base64url");
describe("documented receiver verification", () => {
  it("accepts the exact bytes and rejects tampering, stale timestamps, and invalid secrets", () => {
    expect(
      verifyReceivedWebhook(secret, eventId, timestamp, body, sign()),
    ).toBe(true);
    expect(
      verifyReceivedWebhook(
        secret,
        eventId,
        timestamp,
        Buffer.from("{}"),
        sign(),
      ),
    ).toBe(false);
    expect(
      verifyReceivedWebhook(secret, "changed", timestamp, body, sign()),
    ).toBe(false);
    const stale = String(Number(timestamp) - 301);
    expect(
      verifyReceivedWebhook(secret, eventId, stale, body, sign(stale)),
    ).toBe(false);
    expect(
      verifyReceivedWebhook("invalid", eventId, timestamp, body, sign()),
    ).toBe(false);
    expect(
      verifyReceivedWebhook(secret, eventId, timestamp, body, "v1=short"),
    ).toBe(false);
  });
  it("verifies before accepting and records duplicate event IDs only once", async () => {
    const receiver = createVerifiedReceiver(secret, ":memory:");
    await new Promise<void>((resolve) =>
      receiver.server.listen(0, "127.0.0.1", resolve),
    );
    const url = `http://127.0.0.1:${(receiver.server.address() as AddressInfo).port}/webhooks`;
    const send = (signature: string) =>
      fetch(url, {
        method: "POST",
        body: new Uint8Array(body),
        headers: {
          "webhook-id": eventId,
          "webhook-timestamp": timestamp,
          "webhook-signature": signature,
        },
      });
    try {
      expect((await send("bad")).status).toBe(401);
      expect(await (await send(sign())).json()).toEqual({
        signatureVerified: true,
        duplicate: false,
      });
      expect(await (await send(sign())).json()).toEqual({
        signatureVerified: true,
        duplicate: true,
      });
    } finally {
      await new Promise<void>((resolve) =>
        receiver.server.close(() => resolve()),
      );
      receiver.closeDatabase();
    }
  });
});
