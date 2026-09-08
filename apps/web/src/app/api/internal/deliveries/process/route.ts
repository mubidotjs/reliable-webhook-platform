import { after } from "next/server";
import { handleApiRequest } from "@/lib/api-request";
import { ApiError } from "@/lib/api-errors";
import { readBoundedBody } from "@/lib/bounded-body";
import { createDeliveryProcessor } from "@/modules/deliveries/processor";
import {
  deliveryJobSchema,
  verifyQueueRequest,
} from "@/modules/deliveries/queue";
import { dispatchSafely } from "@/modules/deliveries/outbox";
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
        "/api/internal/deliveries/process",
      ))
    )
      throw new ApiError(
        401,
        "INVALID_QUEUE_SIGNATURE",
        "Unauthorized",
        "A valid queue signature is required.",
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ApiError(
        400,
        "INVALID_JOB",
        "Invalid job",
        "Invalid queue message.",
      );
    }
    const job = deliveryJobSchema.safeParse(parsed);
    if (!job.success)
      throw new ApiError(
        400,
        "INVALID_JOB",
        "Invalid job",
        "Invalid queue message.",
      );
    await createDeliveryProcessor().process(job.data);
    after(dispatchSafely);
    return new Response(null, { status: 204 });
  });
}
