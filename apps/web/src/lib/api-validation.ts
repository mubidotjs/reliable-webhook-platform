import type { z } from "zod";

import { ApiError } from "@/lib/api-errors";

export function parseRequest<T extends z.ZodType>(
  schema: T,
  value: unknown,
  status: 400 | 422 = 422,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      status,
      "INVALID_REQUEST",
      "Invalid request",
      "The request does not match the documented contract.",
    );
  }
  return result.data;
}
