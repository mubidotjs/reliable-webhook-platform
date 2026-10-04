import Link from "next/link";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import { PageHeading, RecordLink } from "@/components/dashboard/common";
import { DeliveryList } from "@/components/dashboard/delivery-list";
import { Button } from "@/components/ui/button";
export default async function DashboardPage() {
  const workspace = await requireDashboardWorkspace();
  const data = await dashboardQueries.overview(workspace.id);
  const empty = !data.endpoints && !data.events && !data.deliveries;
  return (
    <>
      <PageHeading
        title="Overview"
        description="Recent delivery activity in your workspace."
        actions={
          <Button asChild>
            <Link
              href={
                data.endpoints ? "/dashboard/events" : "/dashboard/endpoints"
              }
            >
              {data.endpoints ? "Send test event" : "Add endpoint"}
            </Link>
          </Button>
        }
      />
      <section
        aria-label="Workspace totals"
        className="mb-6 grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface py-4"
      >
        {(
          [
            ["Endpoints", data.endpoints, "endpoints"],
            ["Events", data.events, "events"],
            ["Deliveries", data.deliveries, "deliveries"],
          ] as const
        ).map(([label, count, path]) => (
          <Link
            key={label}
            href={"/dashboard/" + path}
            className="px-4 sm:px-6"
          >
            <span className="text-xs text-muted">{label}</span>
            <span className="mt-1 block text-2xl font-semibold tabular-nums">
              {count}
            </span>
          </Link>
        ))}
      </section>
      {empty && (
        <section className="mb-6 border-b border-line pb-6">
          <h2 className="text-lg font-semibold">Your first webhook</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                [
                  "Add endpoint",
                  "/dashboard/endpoints",
                  "Register a public HTTPS URL you control.",
                ],
                [
                  "Configure receiver",
                  "/dashboard/guide",
                  "Save the secret and verify signatures at your receiver.",
                ],
                [
                  "Send test event",
                  "/dashboard/events",
                  "Submit a small synthetic JSON payload.",
                ],
                [
                  "Inspect delivery",
                  "/dashboard/deliveries",
                  "Check the HTTP result and every attempt.",
                ],
              ] as const
            ).map(([label, href, text], index) => (
              <li key={label}>
                <RecordLink href={href}>
                  {index + 1}. {label}
                </RecordLink>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Recent deliveries</h2>
        <RecordLink href="/dashboard/deliveries">All deliveries</RecordLink>
      </div>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <RecordLink href="/dashboard/deliveries?status=EXHAUSTED">
          Inspect exhausted deliveries
        </RecordLink>
        <RecordLink href="/dashboard/deliveries?status=RETRY_SCHEDULED">
          Inspect scheduled retries
        </RecordLink>
      </div>
      <DeliveryList rows={data.recent} />
      <p className="mt-4 text-xs leading-6 text-muted">
        Workspace totals and the five most recent deliveries. An empty workspace
        does not indicate queue or destination health.
      </p>
      {!empty && (
        <p className="mt-4 text-sm">
          <RecordLink href="/dashboard/guide">
            Setup guide and signature verification
          </RecordLink>
        </p>
      )}
    </>
  );
}
