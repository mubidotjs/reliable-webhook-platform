import type { ProblemDetails } from "@rwp/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    public readonly safeDetail: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export function problemResponse(
  error: ApiError,
  correlationId: string,
): Response {
  const body: ProblemDetails = {
    type: `urn:rwp:problem:${error.code.toLowerCase().replaceAll("_", "-")}`,
    title: error.title,
    status: error.status,
    detail: error.safeDetail,
    code: error.code,
    correlationId,
  };
  return Response.json(body, {
    status: error.status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/problem+json",
      "x-correlation-id": correlationId,
    },
  });
}

export function resourceResponse(
  body: unknown,
  correlationId: string,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-correlation-id": correlationId,
    },
  });
}
