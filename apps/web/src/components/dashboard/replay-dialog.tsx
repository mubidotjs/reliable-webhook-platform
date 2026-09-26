"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { workspaceRequest, WorkspaceApiError } from "./api";
type Target = {
  eligible: boolean;
  endpointRevision: string;
  destinationUrl: string;
};
export function ReplayDialog({
  deliveryId,
  target,
}: {
  deliveryId: string;
  target: Target;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const intent = useRef<{ key: string; endpointRevision: string } | null>(null);
  const [snapshot, setSnapshot] = useState(target);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    intent.current ??= {
      key: crypto.randomUUID(),
      endpointRevision: snapshot.endpointRevision,
    };
    try {
      const result = (await workspaceRequest(
        `/api/deliveries/${deliveryId}/replay`,
        "POST",
        { endpointRevision: intent.current.endpointRevision },
        { "Idempotency-Key": intent.current.key },
      )) as { data: { deliveryId: string } };
      dialog.current?.close();
      router.push(
        "/dashboard/deliveries/" + encodeURIComponent(result.data.deliveryId),
      );
      router.refresh();
    } catch (failure) {
      if (
        failure instanceof WorkspaceApiError &&
        failure.code === "ENDPOINT_CHANGED"
      ) {
        try {
          const result = (await workspaceRequest(
            `/api/deliveries/${deliveryId}`,
            "GET",
          )) as { data: { replay: Target } };
          setSnapshot(result.data.replay);
          intent.current = null;
          setError(
            "Endpoint configuration changed. Review the destination below and confirm again.",
          );
        } catch {
          setError(
            "Could not load the current endpoint. Close this dialog and refresh the page.",
          );
        }
      } else
        setError(
          failure instanceof Error
            ? failure.message
            : "Replay could not be created.",
        );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        disabled={!target.eligible}
        onClick={() => {
          if (!intent.current) {
            setSnapshot(target);
            setError("");
          }
          dialog.current?.showModal();
        }}
      >
        Replay delivery
      </Button>
      {!target.eligible && (
        <p className="text-xs text-slate-400">
          Replay requires a finished delivery and an enabled endpoint.
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="replay-title"
        aria-describedby="replay-description"
        onCancel={(e) => {
          if (submitting.current) e.preventDefault();
        }}
        className="w-[calc(100%_-_2rem)] max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-100 backdrop:bg-black/70"
      >
        <h2 id="replay-title" className="text-xl font-semibold">
          Replay webhook delivery?
        </h2>
        <p
          id="replay-description"
          className="mt-4 text-sm leading-6 text-slate-300"
        >
          This will create a new delivery sequence and send the same event again
          to the current destination, even if it was already received. The
          original delivery history will remain unchanged.
        </p>
        <p className="my-4 break-all rounded bg-slate-950 p-3 font-mono text-sm">
          {snapshot.destinationUrl}
        </p>
        <p className="text-xs text-slate-400">
          Receivers may deduplicate this event using its unchanged event ID.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || !snapshot.eligible}
            onClick={() => void submit()}
          >
            {busy ? "Creating replay…" : "Confirm replay"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
