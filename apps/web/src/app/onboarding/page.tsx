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
      <section className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950/90 p-7 sm:p-9">
        <p className="text-xs font-medium text-cyan-300">First-time setup</p>
        <h1 className="mt-4 text-[28px] leading-9 font-semibold tracking-tight text-white">
          Name your workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Your private workspace keeps endpoints, events, and delivery history
          together.
        </p>
        <WorkspaceForm />
      </section>
    </main>
  );
}
