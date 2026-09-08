import { parseQueueEnvironment } from "@rwp/config";
import { qstashClient } from "../src/modules/deliveries/queue";
const config = parseQueueEnvironment(process.env);
if (config.QUEUE_ADAPTER !== "qstash")
  throw new Error("QUEUE_ADAPTER must be qstash");
await qstashClient().schedules.create({
  scheduleId: "rwp-delivery-recovery",
  destination: new URL("/api/internal/deliveries/recover", config.APP_URL).href,
  cron: "*/5 * * * *",
  body: "{}",
  retries: 0,
});
console.info("Recovery schedule configured.");
