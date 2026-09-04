export const deliveryStatuses = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "RETRY_SCHEDULED",
  "EXHAUSTED",
  "CANCELLED",
] as const;

export type DeliveryStatus = (typeof deliveryStatuses)[number];

const allowedTransitions: Readonly<
  Record<DeliveryStatus, readonly DeliveryStatus[]>
> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SUCCEEDED", "RETRY_SCHEDULED", "EXHAUSTED"],
  SUCCEEDED: [],
  RETRY_SCHEDULED: ["PROCESSING", "CANCELLED"],
  EXHAUSTED: [],
  CANCELLED: [],
};

export function canTransitionDelivery(
  current: DeliveryStatus,
  next: DeliveryStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

export function assertDeliveryTransition(
  current: DeliveryStatus,
  next: DeliveryStatus,
): void {
  if (!canTransitionDelivery(current, next)) {
    throw new Error(`Invalid delivery transition: ${current} -> ${next}`);
  }
}
