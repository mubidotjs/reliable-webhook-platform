"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { inputStyle } from "./common";
import { workspaceRequest, WorkspaceApiError } from "./api";
import { ConfirmDialog } from "./confirm-dialog";

type Endpoint = {
  name?: string | null;
  id: string;
  url: string;
  status: string;
};
export function EndpointForm({ endpoint }: { endpoint?: Endpoint }) {
  const router = useRouter();
  const [name, setName] = useState(endpoint?.name ?? "");
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState<"rotate" | "disable" | null>(
    null,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const disabled = endpoint?.status === "DISABLED";
  async function mutate(action: "save" | "rotate" | "disable") {
    if (submitting.current) return;
    submitting.current = true;
    setConfirmation(null);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const path = endpoint
        ? `/v1/endpoints/${endpoint.id}${action === "rotate" ? "/rotate-secret" : ""}`
        : "/v1/endpoints";
      const result = (await workspaceRequest(
        path,
        !endpoint || action === "rotate" ? "POST" : "PATCH",
        action === "rotate"
          ? undefined
          : action === "disable"
            ? { status: "DISABLED" }
            : { url, name },
      )) as {
        signingSecret?: string;
        data: { id?: string; signingSecret?: string };
      };
      const newSecret = result.signingSecret ?? result.data.signingSecret;
      if (newSecret) {
        setSecret(newSecret);
        setCopied(false);
      }
      if (!endpoint && result.data.id) setCreatedId(result.data.id);
      setMessage(
        action === "rotate"
          ? "Secret rotated. Save the new secret below."
          : action === "disable"
            ? "Endpoint disabled."
            : endpoint
              ? "Endpoint settings updated."
              : "Endpoint created. Save its secret before continuing.",
      );
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof WorkspaceApiError && failure.uncertain
          ? "The result is uncertain. Check the endpoint list before repeating this operation. If a created or rotated secret was not received, rotate it from the endpoint detail page."
          : failure instanceof Error
            ? failure.message
            : "The endpoint could not be updated.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="max-w-[720px] p-4 sm:p-6">
      <h2 className="text-lg font-semibold">
        {endpoint ? "Endpoint settings" : "Add endpoint"}
      </h2>
      {disabled && (
        <p className="mt-3 text-sm text-muted">
          This endpoint is disabled. It remains available for audit history.
        </p>
      )}
      <form
        className="mt-4 space-y-4"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void mutate("save");
        }}
      >
        <label className="block text-sm text-slate-300">
          Endpoint name (optional)
          <input
            className={inputStyle}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy || disabled || Boolean(createdId)}
          />
        </label>
        <label className="block text-sm text-slate-300">
          Receiver URL
          <input
            type="url"
            aria-describedby="receiver-description"
            required
            maxLength={2048}
            className={inputStyle}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy || disabled || Boolean(createdId)}
            placeholder="https://your-service.example/webhooks"
          />
        </label>
        <p id="receiver-description" className="text-xs leading-6 text-muted">
          Use a public HTTPS receiver you control, not the QStash API URL.
          Delivery timeout: 5 seconds.
        </p>
        {!disabled && !createdId && (
          <Button disabled={busy}>
            {busy
              ? "Saving..."
              : endpoint
                ? "Save endpoint"
                : "Create endpoint"}
          </Button>
        )}
      </form>
      {endpoint && !disabled && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="font-semibold">Signing and endpoint lifecycle</h3>
          <p className="mt-2 text-sm text-muted">
            Rotation affects future deliveries. Disabling is permanent and
            cancels pending deliveries.
          </p>
        </div>
      )}
      {endpoint && !disabled && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={busy || Boolean(secret)}
            onClick={() => setConfirmation("rotate")}
          >
            Rotate secret
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => setConfirmation("disable")}
          >
            Disable endpoint
          </Button>
        </div>
      )}
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="feedback-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="feedback-success">
          {message}
        </p>
      )}
      {secret && (
        <div
          data-secret
          className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/5 p-4"
        >
          <h3 className="font-semibold text-amber-200">
            Save your signing secret
          </h3>
          <p className="my-3 text-sm leading-6 text-slate-300">
            Shown once. Save and acknowledge it before closing this form. Store
            it in your receiver environment, not in frontend code. It cannot be
            retrieved after you leave this page.
          </p>
          <code className="block break-all rounded bg-slate-950 p-3 text-sm">
            {secret}
          </code>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                } catch {
                  setError(
                    "Clipboard access failed. Select and copy the secret above.",
                  );
                }
              }}
            >
              {copied ? "Copied" : "Copy secret"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSecret("");
                setMessage(
                  "Secret dismissed. Configure it in your receiver before sending an event.",
                );
              }}
            >
              I saved the secret
            </Button>
          </div>
        </div>
      )}
      {createdId && (
        <Link
          className="mt-5 inline-block text-cyan-300"
          href={`/dashboard/endpoints/${createdId}`}
        >
          Open endpoint →
        </Link>
      )}
      <ConfirmDialog
        open={confirmation !== null}
        title={
          confirmation === "disable"
            ? "Disable this endpoint?"
            : "Rotate the signing secret?"
        }
        description={
          confirmation === "disable"
            ? "Pending deliveries will be cancelled. This cannot be undone. The endpoint remains available for audit history."
            : "Update your receiver with the new secret. Existing deliveries keep their previous secret; retain its verification key until they finish."
        }
        confirmLabel={
          confirmation === "disable" ? "Confirm disable" : "Confirm rotation"
        }
        destructive={confirmation === "disable"}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) void mutate(confirmation);
        }}
      />
    </section>
  );
}
