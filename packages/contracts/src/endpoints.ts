import { z } from "./zod-openapi";

export const endpointIdSchema = z.string().min(1).max(64);
export const endpointStatusSchema = z.enum(["ENABLED", "DISABLED"]);
export const endpointTimeoutSchema = z.number().int().min(1_000).max(15_000);
export const endpointUrlSchema = z.string().trim().min(1).max(2_048);

export const endpointSchema = z.object({
  id: endpointIdSchema,
  url: z.string().url(),
  status: endpointStatusSchema,
  timeoutMs: endpointTimeoutSchema,
  secretVersion: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const createEndpointSchema = z
  .object({
    url: endpointUrlSchema,
    timeoutMs: endpointTimeoutSchema.default(5_000),
  })
  .strict();

const editEndpointSchema = z
  .object({
    url: endpointUrlSchema.optional(),
    timeoutMs: endpointTimeoutSchema.optional(),
  })
  .strict()
  .refine((value) => value.url !== undefined || value.timeoutMs !== undefined, {
    message: "At least one endpoint field must be provided.",
  });

const disableEndpointSchema = z
  .object({ status: z.literal("DISABLED") })
  .strict();

export const updateEndpointSchema = z.union([
  editEndpointSchema,
  disableEndpointSchema,
]);

export const endpointResponseSchema = z.object({ data: endpointSchema });

export const createEndpointResponseSchema = z.object({
  data: endpointSchema,
  signingSecret: z.string().regex(/^whsec_[A-Za-z0-9_-]{43}$/),
});

export const rotateEndpointSecretResponseSchema = z.object({
  data: z.object({
    endpointId: endpointIdSchema,
    secretVersion: z.number().int().positive(),
    signingSecret: z.string().regex(/^whsec_[A-Za-z0-9_-]{43}$/),
    createdAt: z.string().datetime({ offset: true }),
  }),
});

export const endpointListResponseSchema = z.object({
  data: z.array(endpointSchema),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    nextCursor: z.string().nullable(),
  }),
});

export type CreateEndpointInput = z.infer<typeof createEndpointSchema>;
export type UpdateEndpointInput = z.infer<typeof updateEndpointSchema>;
export type EndpointResource = z.infer<typeof endpointSchema>;
