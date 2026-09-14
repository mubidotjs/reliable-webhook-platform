import { notFound } from "next/navigation";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import {
  PageHeading,
  RecordLink,
  StatusBadge,
} from "@/components/dashboard/common";
import { EndpointForm } from "@/components/dashboard/endpoint-form";
export default async function EndpointPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const workspace = await requireDashboardWorkspace();
  const endpoint = await dashboardQueries.endpoint(
    workspace.id,
    (await params).id,
  );
  if (!endpoint) notFound();
  return (
    <>
      <PageHeading
        title="Endpoint details"
        description="URL edits and secret rotation affect future deliveries. Existing deliveries keep their pinned URL and secret."
      />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <StatusBadge status={endpoint.status} />
        <span className="text-sm text-slate-400">
          Secret version {endpoint.currentSecretVersion}
        </span>
      </div>
      <EndpointForm
        endpoint={{
          id: endpoint.id,
          url: endpoint.url,
          status: endpoint.status,
        }}
      />
      <p className="mt-6 text-sm">
        <RecordLink href="/dashboard/guide">
          Configure signature verification
        </RecordLink>{" "}
        · <RecordLink href="/dashboard/events">Send a test event</RecordLink>
      </p>
    </>
  );
}
