import { createOpenApiDocument } from "@rwp/contracts";

export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(createOpenApiDocument(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
