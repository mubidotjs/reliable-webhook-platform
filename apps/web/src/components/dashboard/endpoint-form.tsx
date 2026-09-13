"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { inputStyle, panel } from "./common";
import { workspaceRequest, WorkspaceApiError } from "./api";
type Endpoint = { id: string; url: string; status: string };
export function EndpointForm({ endpoint }: { endpoint?: Endpoint }) {
  const router = useRouter();
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [copied, setCopied] = useState(false);
  const disabled = endpoint?.status === "DISABLED";
  async function mutate(action: "save" | "rotate" | "disable") {
    if (
      action === "disable" &&
      !window.confirm(
        "Disable this endpoint? Pending deliveries will be cancelled. This cannot be undone.",
      )
    )
      return;
    if (
      action === "rotate" &&
      !window.confirm(
        "Rotate the signing secret? Update your receiver with the new secret; existing deliveries keep their previous secret.",
      )
    )
      return;
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
            : { url },
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
              ? "Endpoint URL updated."
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
      setBusy(false);
    }
  }
  return (
    <section className={panel}>
      <h2 className="text-lg font-semibold">
        {endpoint ? "Endpoint settings" : "Add endpoint"}
      </h2>
      {disabled && (
        <p className="mt-3 text-sm text-amber-300">
          This endpoint is disabled. It remains available for audit history.
        </p>
      )}
      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate("save");
        }}
      >
        <label className="block text-sm text-slate-300">
          Receiver URL
          <input
            type="url"
            required
            maxLength={2048}
            className={inputStyle}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy || disabled || Boolean(createdId)}
            placeholder="https://your-service.example/webhooks"
          />
        </label>
        <p className="text-xs leading-6 text-slate-400">
          Use a public HTTPS receiver you control, not the QStash API URL.
          Delivery timeout: 5 seconds.
        </p>
        {!disabled && !createdId && (
          <Button disabled={busy}>
            {busy ? "Saving..." : endpoint ? "Save URL" : "Create endpoint"}
          </Button>
        )}
      </form>
      {endpoint && !disabled && (
        <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-800 pt-5">
          <Button
            variant="secondary"
            disabled={busy || Boolean(secret)}
            onClick={() => void mutate("rotate")}
          >
            Rotate secret
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void mutate("disable")}
          >
            Disable endpoint
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-5 text-sm leading-6 text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-5 text-sm text-cyan-300">
          {message}
        </p>
      )}
      {secret && (
        <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/5 p-4">
          <h3 className="font-semibold text-amber-200">
            Save your signing secret
          </h3>
          <p className="my-3 text-sm leading-6 text-slate-300">
            Shown once. Store it in your receiver environment, not in frontend
            code. It cannot be retrieved after you leave this page.
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
    </section>
  );
}
