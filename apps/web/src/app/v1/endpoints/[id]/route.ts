import { endpointIdSchema, updateEndpointSchema } from "@rwp/contracts";

import {
  handleApiRequest,
  parseJsonBody,
  requireTrustedOrigin,
  requireWorkspace,
} from "@/lib/api-request";
import { ApiError, resourceResponse } from "@/lib/api-errors";
import { parseRequest } from "@/lib/api-validation";
import { createEndpointService } from "@/modules/endpoints/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function endpointId(value: string): string {
  const parsed = endpointIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      404,
      "ENDPOINT_NOT_FOUND",
      "Endpoint not found",
      "The endpoint does not exist in the authenticated workspace.",
    );
  }
  return parsed.data;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleApiRequest(request, async (correlationId) => {
    const actor = await requireWorkspace(request, correlationId);
    const { id } = await context.params;
    const data = await createEndpointService().read(actor, endpointId(id));
    return resourceResponse({ data }, correlationId);
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleApiRequest(request, async (correlationId) => {
    const actor = await requireWorkspace(request, correlationId);
    requireTrustedOrigin(request);
    const { id } = await context.params;
    const input = parseRequest(
      updateEndpointSchema,
      await parseJsonBody(request),
    );
    const data = await createEndpointService().update(
      actor,
      endpointId(id),
      input,
    );
    return resourceResponse({ data }, correlationId);
  });
}
