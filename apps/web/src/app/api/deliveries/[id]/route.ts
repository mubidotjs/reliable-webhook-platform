import { handleApiRequest, requireWorkspace } from "@/lib/api-request";
import { resourceResponse, ApiError } from "@/lib/api-errors";
import { deliveryQueries } from "@/modules/deliveries/queries";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRequest(request, async (correlationId) => {
    const actor = await requireWorkspace(request, correlationId);
    const data = await deliveryQueries.detail(
      actor.workspaceId,
      (await context.params).id,
    );
    if (!data)
      throw new ApiError(
        404,
        "DELIVERY_NOT_FOUND",
        "Delivery not found",
        "The delivery does not exist in this workspace.",
      );
    return resourceResponse({ data }, correlationId);
  });
}
