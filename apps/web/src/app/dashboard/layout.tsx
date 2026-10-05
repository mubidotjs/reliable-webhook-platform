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
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-accent p-3 text-canvas focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-line bg-surface px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          <Webhook className="size-6 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-muted">Webhook workspace</p>
            <p className="font-semibold [overflow-wrap:anywhere]">
              {workspace.name}
            </p>
          </div>
        </Link>
        <SignOutButton />
      </header>
      <div className="lg:grid lg:min-h-[calc(100vh_-_65px)] lg:grid-cols-[216px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-surface/40 lg:border-b-0 lg:border-r">
          <WorkspaceNavigation />
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 p-4 focus:outline-none sm:p-6 lg:p-8"
        >
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
