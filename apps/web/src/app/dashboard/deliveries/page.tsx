import Link from "next/link";
import { deliveryQuerySchema } from "@rwp/contracts";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { deliveryQueries } from "@/modules/deliveries/queries";
import { PageHeading } from "@/components/dashboard/common";
import { DeliveryList } from "@/components/dashboard/delivery-list";
import { DeliveryFilters } from "@/components/dashboard/delivery-filters";
import { RefreshDelivery } from "@/components/dashboard/refresh";
import { ApiError } from "@/lib/api-errors";
export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspace = await requireDashboardWorkspace();
  const raw = await searchParams;
  const parsed = deliveryQuerySchema.safeParse(raw);
  const endpoints = await deliveryQueries.endpoints(workspace.id);
  const heading = (
    <PageHeading
      title="Deliveries"
      description="Inspect webhook status, attempts, and retry history."
    />
  );
  if (!parsed.success)
    return (
      <>
        {heading}
        <p role="alert" className="mb-5 text-red-300">
          Invalid filters. Check the date range, status, IDs, and page size.
        </p>
        <Link className="text-cyan-300 underline" href="/dashboard/deliveries">
          Reset filters
        </Link>
      </>
    );
  const query = parsed.data;
  let result;
  try {
    result = await deliveryQueries.list(workspace.id, query);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "INVALID_CURSOR")
      throw error;
    return (
      <>
        {heading}
        <p role="alert">This page cursor is invalid.</p>
        <Link href="/dashboard/deliveries" className="text-cyan-300 underline">
          Newest records
        </Link>
      </>
    );
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && key !== "limit") params.set(key, String(value));
  if (query.limit !== 25) params.set("limit", String(query.limit));
  const current = params.toString();
  const newest = new URLSearchParams(params);
  newest.delete("cursor");
  const older = new URLSearchParams(params);
  if (result.page.nextCursor) older.set("cursor", result.page.nextCursor);
  const active = result.data.some((d) =>
    ["PENDING", "PROCESSING", "RETRY_SCHEDULED"].includes(d.status),
  );
  return (
    <>
      {heading}
      <DeliveryFilters key={current} query={query} endpoints={endpoints} />
      <RefreshDelivery active={active} />
      <DeliveryList rows={result.data} query={current} />
      <nav
        aria-label="Delivery pagination"
        className="mt-5 flex gap-5 text-sm text-cyan-300"
      >
        {query.cursor && (
          <Link href={"/dashboard/deliveries?" + newest}>Newest records</Link>
        )}
        {result.page.nextCursor && (
          <Link href={"/dashboard/deliveries?" + older}>Older records →</Link>
        )}
      </nav>
    </>
  );
}
