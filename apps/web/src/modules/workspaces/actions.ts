"use server";

import { createWorkspaceSchema } from "@rwp/contracts";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export type CreateWorkspaceState =
  | {
      errors?: { name?: string[] };
      message?: string;
    }
  | undefined;

export async function createWorkspace(
  _state: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/sign-in");
  }

  const result = createWorkspaceSchema.safeParse({
    name: formData.get("name"),
  });
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  await db.workspace.upsert({
    where: { ownerId: session.user.id },
    update: { name: result.data.name },
    create: {
      name: result.data.name,
      ownerId: session.user.id,
    },
  });

  redirect("/dashboard");
}
