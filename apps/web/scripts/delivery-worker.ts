import { setTimeout as pollInterval } from "node:timers/promises";
import { recoverAndDispatch } from "../src/modules/deliveries/outbox";
import { deliveryLog } from "../src/modules/deliveries/log";
import { db } from "../src/lib/db";
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
do {
  try {
    await recoverAndDispatch();
  } catch {
    deliveryLog("outbox_failure", { reason: "WORKER_TICK_FAILED" });
  }
  if (process.argv.includes("--once")) break;
  // This only wakes the poller; PostgreSQL stores every due time.
  await pollInterval(1000);
} while (!stopped);
await db.$disconnect();
