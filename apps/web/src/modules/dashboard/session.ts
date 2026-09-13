import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { db } from "@/lib/db";

export const requireDashboardWorkspace = cache(async () => {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const workspace = await db.workspace.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true, name: true },
  });
  if (!workspace) redirect("/onboarding");
  return workspace;
});
