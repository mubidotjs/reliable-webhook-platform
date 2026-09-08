import { after } from "next/server";
import { createEventSchema } from "@rwp/contracts";
import {
  handleApiRequest,
  requireWorkspace,
  requireTrustedOrigin,
} from "@/lib/api-request";
import { ApiError, resourceResponse } from "@/lib/api-errors";
import { parseRequest } from "@/lib/api-validation";
import { readBoundedBody } from "@/lib/bounded-body";
import { createEventService } from "@/modules/events/service";
import { dispatchSafely } from "@/modules/deliveries/outbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  return handleApiRequest(request, async (correlationId) => {
    const actor = await requireWorkspace(request, correlationId);
    requireTrustedOrigin(request);
    const raw = await readBoundedBody(request);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(
        400,
        "MALFORMED_JSON",
        "Malformed JSON",
        "A valid JSON body is required.",
      );
    }
    const data = await createEventService().ingest(
      actor,
      parseRequest(createEventSchema, body),
    );
    after(dispatchSafely);
    return resourceResponse({ data }, correlationId, 202);
  });
}
