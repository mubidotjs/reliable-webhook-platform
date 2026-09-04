import { redirect } from "next/navigation";

import { WorkspaceForm } from "@/components/workspace-form";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OnboardingPage(): Promise<React.ReactNode> {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/sign-in");
  }

  const workspace = await db.workspace.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (workspace) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950/90 p-7 shadow-panel sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
          First-time setup
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          Name your workspace
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-400">
          This is the authorization boundary for endpoints, events, deliveries,
          and API keys.
        </p>
        <WorkspaceForm />
      </section>
    </main>
  );
}
