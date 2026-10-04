export type DeliveryLog = {
  tenantId?: string;
  eventId?: string;
  endpointId?: string;
  deliveryId?: string;
  attemptId?: string;
  correlationId?: string;
  requestId?: string;
  outboxId?: string;
  queueMessageId?: string;
  reason?: string;
  durationMs?: number;
  delayMs?: number;
};
const allowed = new Set([
  "tenantId",
  "eventId",
  "endpointId",
  "deliveryId",
  "attemptId",
  "correlationId",
  "requestId",
  "outboxId",
  "queueMessageId",
  "reason",
  "durationMs",
  "delayMs",
]);
export function deliveryLog(event: string, fields: DeliveryLog): void {
  const level = /failed|failure|invalid_signature/.test(event)
    ? "warn"
    : "info";
  const levels = ["trace", "debug", "info", "warn", "error", "fatal"];
  if (levels.indexOf(level) < levels.indexOf(process.env.LOG_LEVEL ?? "info"))
    return;
  const safe = Object.fromEntries(
    Object.entries(fields)
      .filter(
        ([key, value]) =>
          allowed.has(key) &&
          (typeof value === "string" ||
            (typeof value === "number" && Number.isFinite(value))),
      )
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 256) : value,
      ]),
  );
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...safe,
    }),
  );
}
