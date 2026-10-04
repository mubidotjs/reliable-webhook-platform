import { notFound } from "next/navigation";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import {
  PageHeading,
  RecordLink,
  StatusBadge,
} from "@/components/dashboard/common";
import { EndpointForm } from "@/components/dashboard/endpoint-form";
import { CopyId } from "@/components/dashboard/copy-id";
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
      <div className="mb-4">
        <RecordLink href="/dashboard/endpoints">← Back to endpoints</RecordLink>
      </div>
      <PageHeading
        title="Endpoint details"
        description="URL edits and secret rotation affect future deliveries. Existing deliveries keep their pinned URL and secret."
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <StatusBadge status={endpoint.status} />
        <span className="text-xs text-muted">
          Secret version {endpoint.currentSecretVersion}
        </span>
      </div>
      <div className="mb-4 space-y-1">
        <p className="text-xs text-muted">Endpoint ID</p>
        <CopyId value={endpoint.id} label="endpoint ID" />
        <p className="text-xs text-muted">Receiver URL</p>
        <CopyId value={endpoint.url} label="endpoint URL" />
      </div>
      <div className="max-w-[720px] rounded-lg border border-line bg-surface">
        <EndpointForm
          endpoint={{
            id: endpoint.id,
            name: endpoint.name,
            url: endpoint.url,
            status: endpoint.status,
          }}
        />
      </div>
      <p className="mt-6 text-sm">
        <RecordLink href="/dashboard/guide">
          Configure signature verification
        </RecordLink>{" "}
        · <RecordLink href="/dashboard/events">Send a test event</RecordLink>
      </p>
    </>
  );
}
