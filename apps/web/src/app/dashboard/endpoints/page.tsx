import { endpointLabel } from "@/components/dashboard/delivery-format";
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
import { FormDisclosure } from "@/components/dashboard/form-disclosure";
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
        description="Your HTTPS receivers for signed webhook requests. Up to five endpoints can be enabled."
      />
      <FormDisclosure
        title="Add endpoint"
        initiallyOpen={!cursor && !result.data.length}
      >
        <EndpointForm />
      </FormDisclosure>
      <h2 className="mb-4 text-lg font-semibold">Registered endpoints</h2>
      {!result.data.length ? (
        <EmptyState>
          {cursor
            ? "No older endpoints on this page."
            : "No endpoints yet. Add your receiver URL above to get started."}
        </EmptyState>
      ) : (
        <div
          className="table-region"
          role="region"
          aria-label="Endpoint records"
          tabIndex={0}
        >
          <table className="data-table min-w-[660px]">
            <caption className="sr-only">Registered endpoints</caption>
            <thead>
              <tr>
                {[
                  "Endpoint / destination",
                  "Status",
                  "Secret version",
                  "Created (UTC)",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.map((e) => (
                <tr key={e.id}>
                  <td className="max-w-sm">
                    <RecordLink href={"/dashboard/endpoints/" + e.id}>
                      {endpointLabel(e)}
                    </RecordLink>
                    <p
                      className="mt-1 truncate font-mono text-xs text-muted"
                      title={e.url}
                    >
                      {e.url}
                    </p>
                  </td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="tabular-nums">{e.currentSecretVersion}</td>
                  <td className="text-xs">
                    <Time value={e.createdAt} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
