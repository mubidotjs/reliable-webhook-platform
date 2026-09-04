"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  createWorkspace,
  type CreateWorkspaceState,
} from "@/modules/workspaces/actions";

export function WorkspaceForm(): React.ReactNode {
  const [state, action, pending] = useActionState<
    CreateWorkspaceState,
    FormData
  >(createWorkspace, undefined);

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="workspace-name"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Workspace name
        </label>
        <input
          id="workspace-name"
          name="name"
          minLength={2}
          maxLength={80}
          required
          autoComplete="organization"
          aria-describedby={
            state?.errors?.name ? "workspace-name-error" : undefined
          }
          aria-invalid={Boolean(state?.errors?.name)}
          placeholder="Delivery Lab"
          className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
        />
        {state?.errors?.name ? (
          <p id="workspace-name-error" className="mt-2 text-sm text-rose-300">
            {state.errors.name[0]}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
