import { after } from "next/server";
import { replayKeySchema, replayRequestSchema } from "@rwp/contracts";
import {
  handleApiRequest,
  requireWorkspace,
  requireTrustedOrigin,
} from "@/lib/api-request";
import { resourceResponse, ApiError } from "@/lib/api-errors";
import { parseRequest } from "@/lib/api-validation";
import { readBoundedBody } from "@/lib/bounded-body";
import { createReplayService } from "@/modules/deliveries/replay";
import { dispatchSafely } from "@/modules/deliveries/outbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRequest(request, async (correlationId) => {
    const actor = await requireWorkspace(request, correlationId);
    requireTrustedOrigin(request);
    const key = parseRequest(
      replayKeySchema,
      request.headers.get("idempotency-key"),
    );
    let raw: unknown;
    try {
      raw = JSON.parse(await readBoundedBody(request, 16 * 1024));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        400,
        "MALFORMED_JSON",
        "Malformed JSON",
        "A valid JSON body is required.",
      );
    }
    const data = await createReplayService().replay(
      actor,
      (await context.params).id,
      key,
      parseRequest(replayRequestSchema, raw),
    );
    after(dispatchSafely);
    return resourceResponse({ data }, correlationId, 202);
  });
}
