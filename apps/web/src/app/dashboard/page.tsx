import { Webhook } from "lucide-react";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.ReactNode> {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/sign-in");
  }

  const workspace = await db.workspace.findUnique({
    where: { ownerId: session.user.id },
    select: {
      name: true,
      _count: {
        select: {
          deliveries: true,
          endpoints: true,
          events: true,
        },
      },
    },
  });
  if (!workspace) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-800 bg-slate-950/85 p-6 shadow-panel sm:p-8">
        <header className="flex flex-col justify-between gap-5 border-b border-slate-800 pb-7 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-300">
              <Webhook aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm text-slate-500">Workspace</p>
              <h1 className="text-xl font-semibold text-white">
                {workspace.name}
              </h1>
            </div>
          </div>
          <SignOutButton />
        </header>
        <section className="py-10">
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            Foundation is connected.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
            Secure endpoint management arrives at M1. The workspace boundary,
            authentication session, and durable schema are ready.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Endpoints", workspace._count.endpoints],
              ["Events", workspace._count.events],
              ["Deliveries", workspace._count.deliveries],
            ].map(([label, count]) => (
              <article
                key={label}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-4 text-3xl font-semibold text-white">
                  {count}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
