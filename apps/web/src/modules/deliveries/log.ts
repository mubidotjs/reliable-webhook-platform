export type DeliveryLog = {
  tenantId?: string;
  eventId?: string;
  endpointId?: string;
  deliveryId?: string;
  attemptId?: string;
  correlationId?: string;
  outboxId?: string;
  reason?: string;
};
export function deliveryLog(event: string, fields: DeliveryLog): void {
  console.info(JSON.stringify({ event, ...fields }));
}
