"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEventSchema, type CreateEventInput } from "@rwp/contracts";
import { Button } from "@/components/ui/button";
import { inputStyle, panel } from "./common";
import { workspaceRequest, WorkspaceApiError } from "./api";
export function EventForm({
  endpoints,
}: {
  endpoints: { id: string; url: string }[];
}) {
  const router = useRouter();
  const [endpointId, setEndpointId] = useState(endpoints[0]?.id ?? "");
  const [type, setType] = useState("test.webhook");
  const [eventId, setEventId] = useState("");
  const [payload, setPayload] = useState(
    '{\n  "message": "Hello from my webhook workspace"\n}',
  );
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [snapshot, setSnapshot] = useState<CreateEventInput | null>(null);
  const [error, setError] = useState("");
  async function submit() {
    setError("");
    let command = snapshot;
    if (!uncertain || !command) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        setError(
          "Payload must be valid JSON. Check quotes, commas, and brackets.",
        );
        return;
      }
      const id = eventId || crypto.randomUUID();
      const validation = createEventSchema.safeParse({
        eventId: id,
        endpointId,
        type,
        payload: parsed,
      });
      if (!validation.success) {
        setError(
          validation.error.issues[0]?.message ?? "Check the event fields.",
        );
        return;
      }
      command = validation.data;
      if (
        new TextEncoder().encode(JSON.stringify(command)).length >
        256 * 1024
      ) {
        setError("The event must fit within 256 KiB.");
        return;
      }
      setEventId(id);
      setSnapshot(command);
    }
    setBusy(true);
    try {
      const result = (await workspaceRequest(
        "/api/events",
        "POST",
        command,
      )) as { data: { deliveryId: string } };
      router.push(`/dashboard/deliveries/${result.data.deliveryId}`);
      router.refresh();
    } catch (failure) {
      const unknown = failure instanceof WorkspaceApiError && failure.uncertain;
      setUncertain(unknown);
      setError(
        unknown
          ? "Acceptance is uncertain. Retry with the same event ID and unchanged payload below; this will not create a second delivery."
          : failure instanceof Error
            ? failure.message
            : "The event could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }
  function newEvent() {
    setEventId("");
    setSnapshot(null);
    setUncertain(false);
    setError("");
  }
  return (
    <section className={panel}>
      <h2 className="text-lg font-semibold">Send test event</h2>
      <p className="mt-2 text-sm text-slate-400">
        Use synthetic data. A successful submission means accepted, not yet
        delivered.
      </p>
      <form
        className="mt-5 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy || uncertain} className="space-y-5">
          <label className="block text-sm">
            Endpoint
            <select
              required
              className={inputStyle}
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
            >
              {endpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.url}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm">
              Event type
              <input
                className={inputStyle}
                required
                maxLength={128}
                value={type}
                onChange={(e) => setType(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Event ID (optional)
              <input
                className={inputStyle}
                maxLength={128}
                placeholder="Generated when you send"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            JSON payload
            <textarea
              className={inputStyle + " min-h-40 font-mono"}
              required
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              spellCheck={false}
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm leading-6 text-red-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy || !endpoints.length}>
            {busy
              ? "Submitting..."
              : uncertain
                ? "Retry same event"
                : "Send event"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (
                !uncertain ||
                window.confirm(
                  "The previous event may already be accepted. Start a separate new event?",
                )
              )
                newEvent();
            }}
          >
            Start a new event
          </Button>
        </div>
      </form>
    </section>
  );
}
