import { readiness } from "@/lib/readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  const ready = await readiness();
  return Response.json(
    {
      service: "reliable-webhook-platform",
      status: ready ? "ready" : "unavailable",
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
