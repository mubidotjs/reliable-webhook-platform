import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QStashQueue, verifyQueueRequest } from "./queue";
import { POST } from "@/app/api/internal/deliveries/process/route";
const key = "synthetic-current-key";
const nextKey = "synthetic-next-key";
const path = "/api/internal/deliveries/process";
const url = "https://app.example.test" + path;
function jwt(
  body: string,
  secret = key,
  subject = url,
  expiry = Math.floor(Date.now() / 1000) + 60,
) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "Upstash",
      sub: subject,
      exp: expiry,
      nbf: Math.floor(Date.now() / 1000) - 5,
      body: createHash("sha256").update(body).digest("base64url"),
    }),
  ).toString("base64url");
  const value = header + "." + payload;
  return (
    value + "." + createHmac("sha256", secret).update(value).digest("base64url")
  );
}
describe("QStash boundary", () => {
  beforeEach(() => {
    vi.stubEnv("QUEUE_ADAPTER", "qstash");
    vi.stubEnv("QSTASH_TOKEN", "synthetic-token");
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", key);
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", nextKey);
    vi.stubEnv("APP_URL", "https://app.example.test");
    vi.stubEnv("QSTASH_URL", "https://qstash.example.test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("accepts both signing keys and binds exact body, URL, and expiry", async () => {
    const body = '{"outboxId":"one","deliveryId":"two","generation":1}';
    for (const secret of [key, nextKey]) {
      const request = new Request(url, {
        headers: { "upstash-signature": jwt(body, secret) },
      });
      expect(await verifyQueueRequest(request, body, path)).toBe(true);
      expect(await verifyQueueRequest(request, body + " ", path)).toBe(false);
    }
    for (const signature of [
      jwt(body, "wrong"),
      jwt(body, key, "https://other.test"),
      jwt(body, key, url, 1),
      "garbage",
    ]) {
      expect(
        await verifyQueueRequest(
          new Request(url, { headers: { "upstash-signature": signature } }),
          body,
          path,
        ),
      ).toBe(false);
    }
  });
  it("rejects unsigned and invalid processor invocations before database work", async () => {
    for (const headers of [{}, { "upstash-signature": "invalid" }]) {
      const response = await POST(
        new Request(url, { method: "POST", body: "{}", headers }),
      );
      expect(response.status).toBe(401);
    }
  });
  it("publishes only identifiers with PostgreSQL's due time and zero provider retries", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ messageId: "provider-1" }));
    const due = new Date(Date.now() + 30_000);
    const job = { outboxId: "one", deliveryId: "two", generation: 2 };
    expect(await new QStashQueue().publish(job, due)).toBe("provider-1");
    const init = fetch.mock.calls[0]?.[1];
    expect(JSON.parse(init?.body as string)).toEqual(job);
    const headers = new Headers(init?.headers);
    expect(headers.get("upstash-retries")).toBe("0");
    expect(headers.get("upstash-not-before")).toBe(
      String(Math.ceil(+due / 1000)),
    );
  });
});
