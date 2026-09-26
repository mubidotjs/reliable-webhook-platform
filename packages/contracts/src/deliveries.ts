import { z } from "./zod-openapi";
export const deliveryStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "RETRY_SCHEDULED",
  "SUCCEEDED",
  "EXHAUSTED",
  "CANCELLED",
]);
export const deliveryQuerySchema = z
  .object({
    status: deliveryStatusSchema.optional(),
    endpointId: z.string().min(1).max(64).optional(),
    eventType: z.string().trim().min(1).max(200).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    search: z.string().trim().min(1).max(128).optional(),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine((v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), {
    message: "Start date must not follow end date.",
    path: ["from"],
  });
export type DeliveryQuery = z.infer<typeof deliveryQuerySchema>;
export const replayRequestSchema = z
  .object({ endpointRevision: z.string().min(1).max(128) })
  .strict();
export const replayKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const replayResponseSchema = z.object({
  data: z.object({ deliveryId: z.string() }),
});
const timestamp = z.string().datetime();
export const deliveryAttemptSchema = z.object({
  id: z.string(),
  sequence: z.number().int(),
  startedAt: timestamp,
  outcome: z
    .object({
      status: z.enum(["SUCCEEDED", "FAILED", "UNCERTAIN"]),
      completedAt: timestamp,
      httpStatus: z.number().nullable(),
      durationMs: z.number().nullable(),
      errorClass: z.string().nullable(),
      resultingState: deliveryStatusSchema,
    })
    .nullable(),
});
export const deliveryRowSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  endpointId: z.string(),
  destinationUrl: z.string(),
  status: deliveryStatusSchema,
  attemptCount: z.number().int(),
  createdAt: timestamp,
  nextAttemptAt: timestamp.nullable(),
  terminalAt: timestamp.nullable(),
  lastError: z.string().nullable(),
  event: z.object({ producerEventId: z.string(), type: z.string() }),
  endpoint: z.object({
    name: z.string().nullable(),
    url: z.string(),
    status: z.enum(["ENABLED", "DISABLED"]),
  }),
  attempts: z.array(deliveryAttemptSchema),
});
export const deliveryListResponseSchema = z.object({
  data: z.array(deliveryRowSchema),
  page: z.object({ limit: z.number(), nextCursor: z.string().nullable() }),
});
export const deliveryDetailSchema = deliveryRowSchema.extend({
  timeoutMs: z.number(),
  retryDeadline: timestamp,
  exhaustedReason: z.string().nullable(),
  replayOfId: z.string().nullable(),
  event: z.object({
    producerEventId: z.string(),
    type: z.string(),
    createdAt: timestamp,
    payload: z.unknown(),
  }),
  replay: z.object({
    eligible: z.boolean(),
    endpointRevision: z.string(),
    destinationUrl: z.string(),
  }),
});
export const deliveryDetailResponseSchema = z.object({
  data: deliveryDetailSchema,
});
