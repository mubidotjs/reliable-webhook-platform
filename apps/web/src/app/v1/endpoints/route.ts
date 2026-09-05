import { createEndpointSchema, cursorPageSchema } from "@rwp/contracts";

import {
  handleApiRequest,
  parseJsonBody,
  requireTrustedOrigin,
  requireWorkspace,
} from "@/lib/api-request";
import { resourceResponse } from "@/lib/api-errors";
import { parseRequest } from "@/lib/api-validation";
import { createEndpointService } from "@/modules/endpoints/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleApiRequest(request, async (correlationId) => {
    const context = await requireWorkspace(request, correlationId);
    requireTrustedOrigin(request);
    const input = parseRequest(
      createEndpointSchema,
      await parseJsonBody(request),
    );
    const result = await createEndpointService().create(context, input);
    return resourceResponse(result, correlationId, 201);
  });
}

export async function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, async (correlationId) => {
    const context = await requireWorkspace(request, correlationId);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = url.searchParams.get("limit") ?? undefined;
    const query = parseRequest(
      cursorPageSchema,
      { ...(cursor ? { cursor } : {}), ...(limit ? { limit } : {}) },
      400,
    );
    const result = await createEndpointService().list(context, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return resourceResponse(result, correlationId);
  });
}
