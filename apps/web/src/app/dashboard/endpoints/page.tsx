import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import {
  PageHeading,
  Pagination,
  EmptyState,
  RecordLink,
  StatusBadge,
  Time,
} from "@/components/dashboard/common";
import { EndpointForm } from "@/components/dashboard/endpoint-form";
export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const workspace = await requireDashboardWorkspace();
  const { cursor } = await searchParams;
  const result = await dashboardQueries.endpoints(workspace.id, cursor);
  return (
    <>
      <PageHeading
        title="Endpoints"
        description="An endpoint is the HTTPS receiver that will receive your signed webhook requests. Up to five endpoints can be enabled."
      />
      <EndpointForm />
      <h2 className="mb-4 mt-8 text-lg font-semibold">Registered endpoints</h2>
      {!result.data.length ? (
        <EmptyState>
          No endpoints yet. Add your receiver URL above to get started.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {result.data.map((e) => (
            <article
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 p-5"
            >
              <div className="min-w-0">
                <RecordLink href={`/dashboard/endpoints/${e.id}`}>
                  {e.url}
                </RecordLink>
                <p className="mt-2 text-xs text-slate-500">
                  <Time value={e.createdAt} /> · Secret version{" "}
                  {e.currentSecretVersion}
                </p>
              </div>
              <StatusBadge status={e.status} />
            </article>
          ))}
        </div>
      )}
      <Pagination
        base="/dashboard/endpoints"
        cursor={result.nextCursor}
        hasCursor={Boolean(cursor)}
      />
    </>
  );
}
