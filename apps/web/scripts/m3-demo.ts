// Local-only fixture runner. Never imported by application routes.
import { randomUUID } from "node:crypto";
import { parseEncryptionKeyring } from "@rwp/config";
import { db } from "../src/lib/db";
import { createEndpointService } from "../src/modules/endpoints/service";
import { createEventService } from "../src/modules/events/service";
import { createDeliveryProcessor } from "../src/modules/deliveries/processor";
const [operation, identity] = process.argv.slice(2);
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.NODE_ENV === "production" ||
  !["127.0.0.1", "localhost"].includes(databaseUrl.hostname) ||
  !identity
)
  throw new Error(
    "Use an isolated local database and provide an owner email/ID or delivery ID.",
  );
const keyring = parseEncryptionKeyring(process.env);
async function run(id: string, sequence: (number | "timeout")[], start?: Date) {
  let index = 0;
  let clock = start ?? new Date();
  const processor = createDeliveryProcessor({
    database: db,
    keyring,
    clock: () => clock,
    random: () => 0,
    transport: async () => {
      const response = sequence[Math.min(index++, sequence.length - 1)]!;
      return response === "timeout"
        ? { httpStatus: null, errorClass: "TIMEOUT", durationMs: 5000 }
        : { httpStatus: response, errorClass: null, durationMs: 128 };
    },
  });
  for (let n = 0; n < 5; n++) {
    const delivery = await db.delivery.findUniqueOrThrow({ where: { id } });
    if (["SUCCEEDED", "EXHAUSTED", "CANCELLED"].includes(delivery.status))
      break;
    clock = delivery.nextAttemptAt ?? clock;
    const work = await db.outboxMessage.findUniqueOrThrow({
      where: { dedupeKey: `delivery:${id}:${delivery.generation}` },
    });
    await processor.process({
      deliveryId: id,
      outboxId: work.id,
      generation: delivery.generation,
    });
  }
  return db.delivery.findUniqueOrThrow({
    where: { id },
    select: { id: true, status: true, eventId: true },
  });
}
try {
  if (operation === "seed") {
    const user = await db.user.findFirstOrThrow({
      where: { OR: [{ id: identity }, { email: identity }] },
      include: { workspace: true },
    });
    if (!user.workspace)
      throw new Error("Complete workspace onboarding first.");
    const actor = {
      userId: user.id,
      workspaceId: user.workspace.id,
      correlationId: randomUUID(),
    };
    const endpoint = await createEndpointService({
      database: db,
      keyring,
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    }).create(actor, {
      name: "Operations demo",
      url: "https://example.com/operations-demo",
      timeoutMs: 5000,
    });
    const results = [];
    for (const [type, sequence] of [
      ["retry", [500, 500, 200]],
      ["timeout", ["timeout", 200]],
      ["exhausted", [500, "timeout", 500, 500, 500]],
    ] as const) {
      const start = new Date(Date.now() - 3_600_000);
      const accepted = await createEventService(db, () => start).ingest(actor, {
        eventId: randomUUID(),
        endpointId: endpoint.data.id,
        type: "demo.m3." + type,
        payload: {
          synthetic: true,
          message: "<script>window.payloadExecuted=true</script>",
          example: type,
        },
      });
      results.push({
        ...(await run(accepted.deliveryId, [...sequence], start)),
        type,
        endpointId: endpoint.data.id,
      });
    }
    console.info("M3_RESULT=" + JSON.stringify(results));
  } else if (operation === "succeed") {
    const delivery = await db.delivery.findUniqueOrThrow({
      where: { id: identity },
      include: { event: true },
    });
    if (!delivery.event.type.startsWith("demo.m3."))
      throw new Error("Only synthetic M3 deliveries can use this fixture.");
    console.info("M3_RESULT=" + JSON.stringify(await run(identity, [200])));
  } else
    throw new Error(
      "Usage: m3-demo.ts seed <owner-email-or-id> | succeed <demo-delivery-id>",
    );
} finally {
  await db.$disconnect();
}
