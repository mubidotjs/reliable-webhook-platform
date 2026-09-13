import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

export function verifyReceivedWebhook(
  secret: string,
  eventId: string,
  timestamp: string,
  rawBody: Buffer,
  signature: string,
  now = Date.now(),
): boolean {
  if (
    !/^whsec_[A-Za-z0-9_-]{43}$/.test(secret) ||
    !/^[A-Za-z0-9_.:-]{1,128}$/.test(eventId) ||
    !/^\d{1,12}$/.test(timestamp) ||
    !/^v1=[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return false;
  const seconds = Number(timestamp);
  if (
    !Number.isSafeInteger(seconds) ||
    Math.abs(Math.floor(now / 1000) - seconds) > 300
  )
    return false;
  const key = Buffer.from(secret.slice(6), "base64url");
  if (key.length !== 32 || key.toString("base64url") !== secret.slice(6))
    return false;
  const expected =
    "v1=" +
    createHmac("sha256", key)
      .update(eventId + "." + timestamp + ".")
      .update(rawBody)
      .digest("base64url");
  key.fill(0);
  const actual = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return (
    actual.length === expectedBytes.length &&
    timingSafeEqual(actual, expectedBytes)
  );
}

export function createVerifiedReceiver(secret: string, databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec(
    "CREATE TABLE IF NOT EXISTS received_events (event_id TEXT PRIMARY KEY, body_hash TEXT NOT NULL)",
  );
  const insert = database.prepare(
    "INSERT INTO received_events (event_id, body_hash) VALUES (?, ?) ON CONFLICT DO NOTHING",
  );
  const read = database.prepare(
    "SELECT body_hash FROM received_events WHERE event_id = ?",
  );
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/webhooks") {
      response.writeHead(404);
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 300 * 1024) {
          response.writeHead(413);
          response.end();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks);
      const header = (name: string) =>
        typeof request.headers[name] === "string"
          ? (request.headers[name] as string)
          : "";
      const eventId = header("webhook-id");
      if (
        !verifyReceivedWebhook(
          secret,
          eventId,
          header("webhook-timestamp"),
          raw,
          header("webhook-signature"),
        )
      ) {
        response.writeHead(401);
        response.end("Invalid signature or stale timestamp");
        return;
      }
      const hash = createHash("sha256").update(raw).digest("hex");
      // In a real service, commit deduplication AND the business update in one transaction.
      // This example's business operation is recording the receipt itself.
      const result = insert.run(eventId, hash);
      const previous = read.get(eventId);
      if (previous?.body_hash !== hash) {
        response.writeHead(409);
        response.end("Event ID conflict");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          signatureVerified: true,
          duplicate: result.changes === 0,
        }),
      );
    } catch {
      response.writeHead(500);
      response.end("Receiver error");
    }
  });
  server.requestTimeout = 5000;
  return { server, closeDatabase: () => database.close() };
}
