// Isolated subprocess fixture: never imported by the application.
import { createDeliveryProcessor } from "../src/modules/deliveries/processor";
import { db } from "../src/lib/db";
const [deliveryId, mode, receiver, timestamp] = process.argv.slice(2);
if (
  process.env.NODE_ENV !== "test" ||
  !deliveryId ||
  !receiver ||
  !timestamp ||
  new URL(receiver).hostname !== "127.0.0.1"
)
  throw new Error("This fixture requires a local test receiver");
const clock = () => (mode === "demo" ? new Date() : new Date(timestamp));
const processor = createDeliveryProcessor({
  database: db,
  clock,
  random: () => 0,
  keyring: {
    activeVersion: "v1",
    keys: new Map([["v1", Buffer.alloc(32, 4)]]),
  },
  transport: async (request) => {
    if (mode === "after-claim") process.exit(17);
    const started = performance.now();
    const response = await fetch(receiver, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(5000),
    });
    if (mode === "after-send") process.exit(17);
    return {
      httpStatus: response.status,
      errorClass: null,
      durationMs: Math.round(performance.now() - started),
    };
  },
});
await processor.recover();
const delivery = await db.delivery.findUniqueOrThrow({
  where: { id: deliveryId },
});
const work = await db.outboxMessage.findUniqueOrThrow({
  where: { dedupeKey: `delivery:${deliveryId}:${delivery.generation}` },
});
await processor.process({
  outboxId: work.id,
  deliveryId,
  generation: delivery.generation,
});
await db.$disconnect();
