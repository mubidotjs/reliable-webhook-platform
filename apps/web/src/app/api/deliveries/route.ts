import { handleApiRequest, requireWorkspace } from "@/lib/api-request";
import { resourceResponse } from "@/lib/api-errors";
import { parseRequest } from "@/lib/api-validation";
import { deliveryQuerySchema } from "@rwp/contracts";
import { deliveryQueries } from "@/modules/deliveries/queries";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handleApiRequest(request, async (correlationId) => {
    const actor = await requireWorkspace(request, correlationId);
    const query = parseRequest(
      deliveryQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams),
      400,
    );
    return resourceResponse(
      await deliveryQueries.list(actor.workspaceId, query),
      correlationId,
    );
  });
}
