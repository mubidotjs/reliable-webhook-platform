import {
  Activity,
  ArrowUpRight,
  Check,
  Clock3,
  RadioTower,
  RotateCcw,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const recentDeliveries = [
  {
    event: "invoice.created",
    endpoint: "billing-receiver",
    status: "Succeeded",
    attempts: "1 attempt",
    age: "12s ago",
    tone: "success",
  },
  {
    event: "user.updated",
    endpoint: "crm-sync",
    status: "Retry scheduled",
    attempts: "2 attempts",
    age: "41s ago",
    tone: "warning",
  },
  {
    event: "subscription.cancelled",
    endpoint: "analytics",
    status: "Exhausted",
    attempts: "5 attempts",
    age: "8m ago",
    tone: "danger",
  },
];

export default function HomePage(): React.ReactNode {
  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-panel backdrop-blur">
        <header className="flex min-h-16 items-center justify-between border-b border-slate-800 px-5 sm:px-7">
          <Link
            href="/"
            className="flex items-center gap-3 font-semibold tracking-tight"
          >
            <span className="grid size-9 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-300">
              <Webhook aria-hidden="true" className="size-5" />
            </span>
            <span>Reliable Webhook Platform</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/api/health/live">System status</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-in">
                Sign in
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden border-r border-slate-800 p-5 lg:block">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Workspace
            </p>
            <nav aria-label="Primary" className="space-y-1">
              {(
                [
                  ["Overview", Activity],
                  ["Endpoints", RadioTower],
                  ["Events", Webhook],
                  ["Deliveries", RotateCcw],
                ] as const
              ).map(([label, Icon], index) => (
                <span
                  key={label}
                  className={
                    index === 0
                      ? "flex min-h-11 items-center gap-3 rounded-lg bg-slate-800/80 px-3 text-sm font-medium text-white"
                      : "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-400"
                  }
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </span>
              ))}
            </nav>
            <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-4 text-cyan-300"
                />
                Delivery semantics
              </div>
              <p className="text-sm leading-6 text-slate-400">
                At-least-once delivery with signed payloads and auditable
                recovery.
              </p>
            </div>
          </aside>

          <section className="p-5 sm:p-7 lg:p-9">
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-cyan-300">
                  <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)]" />
                  Local foundation ready
                </div>
                <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                  Delivery failures should be explainable—and recoverable.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                  Register an endpoint, send a test event, and follow every
                  signed attempt from acceptance through retry or success.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link href="/sign-in">Open workspace</Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["Delivery success", "98.7%", "Last 24 hours", Check],
                  ["Median latency", "182 ms", "Across all attempts", Clock3],
                  ["Outbox backlog", "0", "No delayed messages", RadioTower],
                ] as const
              ).map(([label, value, detail, Icon]) => (
                <article
                  key={label}
                  className="rounded-xl border border-slate-800 bg-slate-900/55 p-5"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-400">
                      {label}
                    </p>
                    <Icon
                      aria-hidden="true"
                      className="size-4 text-slate-500"
                    />
                  </div>
                  <p className="text-3xl font-semibold tracking-tight text-white">
                    {value}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{detail}</p>
                </article>
              ))}
            </div>

            <article className="mt-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/55">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-100">
                    Recent delivery activity
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Representative data until your first workspace is connected.
                  </p>
                </div>
                <span className="hidden text-sm text-slate-500 sm:block">
                  UTC
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Event</th>
                      <th className="px-5 py-3 font-medium">Endpoint</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Attempts</th>
                      <th className="px-5 py-3 text-right font-medium">
                        Received
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {recentDeliveries.map((delivery) => (
                      <tr key={delivery.event}>
                        <td className="px-5 py-4 font-mono text-sm text-slate-200">
                          {delivery.event}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400">
                          {delivery.endpoint}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={
                              delivery.tone === "success"
                                ? "status-badge status-success"
                                : delivery.tone === "warning"
                                  ? "status-badge status-warning"
                                  : "status-badge status-danger"
                            }
                          >
                            {delivery.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400">
                          {delivery.attempts}
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-slate-500">
                          {delivery.age}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}
