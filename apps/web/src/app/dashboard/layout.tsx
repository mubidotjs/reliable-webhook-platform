import Link from "next/link";
import { Webhook } from "lucide-react";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { SignOutButton } from "@/components/sign-out-button";
import { WorkspaceNavigation } from "@/components/dashboard/navigation";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await requireDashboardWorkspace();
  return (
    <main className="min-h-screen px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 shadow-panel">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-5 sm:px-7">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-300">
              <Webhook className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-slate-500">Webhook workspace</p>
              <p className="break-all font-semibold text-white">
                {workspace.name}
              </p>
            </div>
          </Link>
          <SignOutButton />
        </header>
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-slate-800 lg:border-b-0 lg:border-r">
            <WorkspaceNavigation />
          </aside>
          <section className="min-w-0 p-5 sm:p-7 lg:p-9">{children}</section>
        </div>
      </div>
    </main>
  );
}
