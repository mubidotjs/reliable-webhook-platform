import { endpointIdSchema } from "@rwp/contracts";

import {
  handleApiRequest,
  requireTrustedOrigin,
  requireWorkspace,
} from "@/lib/api-request";
import { ApiError, resourceResponse } from "@/lib/api-errors";
import { createEndpointService } from "@/modules/endpoints/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleApiRequest(request, async (correlationId) => {
    const actor = await requireWorkspace(request, correlationId);
    requireTrustedOrigin(request);
    const { id } = await context.params;
    const parsedId = endpointIdSchema.safeParse(id);
    if (!parsedId.success) {
      throw new ApiError(
        404,
        "ENDPOINT_NOT_FOUND",
        "Endpoint not found",
        "The endpoint does not exist in the authenticated workspace.",
      );
    }
    const data = await createEndpointService().rotateSecret(
      actor,
      parsedId.data,
    );
    return resourceResponse({ data }, correlationId, 201);
  });
}
