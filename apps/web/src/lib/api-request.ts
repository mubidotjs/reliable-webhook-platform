import { randomUUID } from "node:crypto";

import { auth } from "@/lib/auth";
import { ApiError, problemResponse } from "@/lib/api-errors";
import { db } from "@/lib/db";

const correlationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceRequestContext = {
  correlationId: string;
  userId: string;
  workspaceId: string;
};

export function correlationIdFor(request: Request): string {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  return supplied && correlationIdPattern.test(supplied)
    ? supplied
    : randomUUID();
}

export async function requireWorkspace(
  request: Request,
  correlationId: string,
): Promise<WorkspaceRequestContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Authentication required",
      "Sign in before accessing workspace resources.",
    );
  }
  const workspace = await db.workspace.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!workspace) {
    throw new ApiError(
      403,
      "WORKSPACE_REQUIRED",
      "Workspace required",
      "Complete workspace onboarding before managing endpoints.",
    );
  }
  return { correlationId, userId: session.user.id, workspaceId: workspace.id };
}

export function requireTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configured = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  let expected: string;
  try {
    expected = new URL(configured).origin;
  } catch {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Internal error",
      "The service is not configured correctly.",
    );
  }
  if (!origin || origin !== expected) {
    throw new ApiError(
      403,
      "FORBIDDEN_ORIGIN",
      "Origin not allowed",
      "Session-authenticated mutations require the application origin.",
    );
  }
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(
      400,
      "MALFORMED_JSON",
      "Malformed JSON",
      "The request body must contain valid JSON.",
    );
  }
}

export async function handleApiRequest(
  request: Request,
  operation: (correlationId: string) => Promise<Response>,
): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    return await operation(correlationId);
  } catch (error) {
    if (error instanceof ApiError) {
      return problemResponse(error, correlationId);
    }
    return problemResponse(
      new ApiError(
        500,
        "INTERNAL_ERROR",
        "Internal error",
        "The service could not complete the request.",
      ),
      correlationId,
    );
  }
}
