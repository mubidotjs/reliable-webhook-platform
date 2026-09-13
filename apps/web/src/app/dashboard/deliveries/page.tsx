import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import { PageHeading, Pagination } from "@/components/dashboard/common";
import { DeliveryList } from "@/components/dashboard/delivery-list";
import { RefreshDelivery } from "@/components/dashboard/refresh";
export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const workspace = await requireDashboardWorkspace();
  const { cursor } = await searchParams;
  const result = await dashboardQueries.deliveries(workspace.id, cursor);
  return (
    <>
      <PageHeading
        title="Deliveries"
        description="Inspect HTTP outcomes, retries, and final delivery states. A successful HTTP response does not by itself prove receiver-side signature verification."
      />
      <RefreshDelivery />
      <DeliveryList rows={result.data} />
      <Pagination
        base="/dashboard/deliveries"
        cursor={result.nextCursor}
        hasCursor={Boolean(cursor)}
      />
    </>
  );
}
