import { z } from "./zod-openapi";

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Workspace names must contain at least 2 characters.")
  .max(80, "Workspace names cannot exceed 80 characters.");

export const createWorkspaceSchema = z.object({
  name: workspaceNameSchema,
});

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
  correlationId: z.string().uuid(),
});

export const cursorPageSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
