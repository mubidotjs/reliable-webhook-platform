import Link from "next/link";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import { PageHeading, panel } from "@/components/dashboard/common";
import { DeliveryList } from "@/components/dashboard/delivery-list";
export default async function DashboardPage() {
  const workspace = await requireDashboardWorkspace();
  const data = await dashboardQueries.overview(workspace.id);
  return (
    <>
      <PageHeading
        title="Overview"
        description="Register a receiver, send an event, and follow each delivery from acceptance to its final result."
      />
      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Endpoints", data.endpoints, "endpoints"],
            ["Events", data.events, "events"],
            ["Deliveries", data.deliveries, "deliveries"],
          ] as const
        ).map(([label, count, path]) => (
          <Link
            key={label}
            href={`/dashboard/${path}`}
            className={panel + " hover:border-cyan-300/50"}
          >
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-4 text-3xl font-semibold">{count}</p>
          </Link>
        ))}
      </div>
      <div className={panel + " mb-8"}>
        <h2 className="text-lg font-semibold">Your first webhook</h2>
        <ol className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
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
              <Link href={href} className="font-medium text-cyan-300">
                {index + 1}. {label} →
              </Link>
              <p className="mt-1 text-slate-400">{text}</p>
            </li>
          ))}
        </ol>
      </div>
      <h2 className="mb-4 text-lg font-semibold">Recent deliveries</h2>
      <DeliveryList rows={data.recent} />
      <p className="mt-5 text-xs leading-6 text-slate-500">
        Counts reflect this workspace only. An empty workspace does not indicate
        queue or destination health.
      </p>
    </>
  );
}
