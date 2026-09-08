import { handleApiRequest } from "@/lib/api-request";
import { ApiError } from "@/lib/api-errors";
import { readBoundedBody } from "@/lib/bounded-body";
import { verifyQueueRequest } from "@/modules/deliveries/queue";
import { recoverAndDispatch } from "@/modules/deliveries/outbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  return handleApiRequest(request, async () => {
    const body = await readBoundedBody(request, 4096);
    if (
      !(await verifyQueueRequest(
        request,
        body,
        "/api/internal/deliveries/recover",
      ))
    )
      throw new ApiError(
        401,
        "INVALID_QUEUE_SIGNATURE",
        "Unauthorized",
        "A valid queue signature is required.",
      );
    await recoverAndDispatch();
    return new Response(null, { status: 204 });
  });
}
