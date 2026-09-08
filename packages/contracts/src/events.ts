import { z } from "./zod-openapi";

export const createEventSchema = z
  .object({
    eventId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_.:-]+$/)
      .optional(),
    endpointId: z.string().min(1).max(64),
    type: z.string().min(1).max(128),
    payload: z.json().openapi({
      type: ["object", "array", "string", "number", "boolean", "null"],
      description: "Any JSON value.",
    }),
  })
  .strict();

export const acceptedEventSchema = z.object({
  data: z.object({
    eventId: z.string(),
    deliveryId: z.string(),
    status: z.enum([
      "PENDING",
      "PROCESSING",
      "SUCCEEDED",
      "RETRY_SCHEDULED",
      "EXHAUSTED",
      "CANCELLED",
    ]),
  }),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;
